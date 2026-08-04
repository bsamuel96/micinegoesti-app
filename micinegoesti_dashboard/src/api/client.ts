import type {
  ApiCart,
  Category,
  CustomerOrderNotification,
  DeliverySettings,
  DeliveryZone,
  GameCampaign,
  GameCampaignState,
  GameLeaderboardResponse,
  GameRewardMode,
  GameScoreSaveResponse,
  GameRecordHolder,
  IssuedVoucher,
  Order,
  Product,
  PublicSettings,
  ShiftHandoverItem,
  ShiftSchedule,
  ShiftTemplate,
  ShiftWhatsAppSubscriber,
  User,
  UserShiftProfile,
  VoucherRule,
  VoucherValidationResult
} from "./types";

const DEFAULT_API_URL = import.meta.env.PROD ? "/api" : "http://localhost:4000/api";
const API_URL = resolveApiUrl(import.meta.env.VITE_API_URL, DEFAULT_API_URL);

function resolveApiUrl(configuredUrl: string | undefined, fallbackUrl: string) {
  const rawUrl = (configuredUrl?.trim() || fallbackUrl).replace(/\/+$/, "");

  try {
    const url = new URL(rawUrl);

    if (url.pathname === "/") {
      url.pathname = "/api";
    }

    return url.toString().replace(/\/+$/, "");
  } catch {
    return rawUrl;
  }
}

type StaticCatalog = {
  categories: Category[];
  products: Product[];
};

let staticCatalogPromise: Promise<StaticCatalog> | null = null;

const CATEGORY_ORDER = [
  "specialitatea-casei",
  "grill",
  "meniuri",
  "ciorbe",
  "toping",
  "sosuri",
  "garnituri",
  "salate",
  "platouri",
  "peste",
  "desert",
  "racoritoare",
  "cafea",
  "bere",
  "vin",
  "bauturi-alcoolice",
  "1-metru-de-bere",
  "oferta-zilei"
];

const DRINK_CATEGORY_PATTERN = /racoritoare|bautur|băutur|bere|vin|cafea|alcool|whisky|vodka|gin|palinca|pălincă/i;

function categoryRank(category: Category) {
  const exact = CATEGORY_ORDER.indexOf(category.slug);
  if (exact >= 0) return exact;
  if (DRINK_CATEGORY_PATTERN.test(`${category.slug} ${category.label}`)) return 900;
  return 100;
}

export function sortMenuCategories(categories: Category[]) {
  return [...categories].sort(
    (a, b) => a.sortOrder - b.sortOrder || categoryRank(a) - categoryRank(b) || a.label.localeCompare(b.label)
  );
}

type RequestOptions = RequestInit & {
  auth?: boolean;
};

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function parseDeliveryZones(value: unknown): DeliveryZone[] {
  const raw = (() => {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string" || !value.trim()) return [];
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  })();

  if (!Array.isArray(raw)) return [];

  return raw
    .map((zone, index) => ({
      id: String(zone.id || `zone-${index + 1}`),
      name: String(zone.name || `Zona ${index + 1}`),
      price: Number.isFinite(Number(zone.price)) && Number(zone.price) >= 0 ? Number(zone.price) : 0,
      isActive: zone.isActive !== false,
      sortOrder: Number.isFinite(Number(zone.sortOrder)) ? Number(zone.sortOrder) : index,
      description: zone.description ? String(zone.description) : null
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}) {
  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isFormData) headers.set("Content-Type", "application/json");

  const token = localStorage.getItem("mdn_token");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, payload.message ?? "API error", payload.details);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function apiBlob(path: string) {
  const headers = new Headers();
  const token = localStorage.getItem("mdn_token");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(response.status, payload.message ?? "API error", payload.details);
  }
  return response.blob();
}

async function loadStaticCatalog() {
  staticCatalogPromise ??= fetch("/data/catalog.json", { headers: { Accept: "application/json" } }).then(async (response) => {
    if (!response.ok) throw new ApiError(response.status, "Static catalog is not available.");
    return response.json() as Promise<StaticCatalog>;
  });

  return staticCatalogPromise;
}

function filterStaticProducts(
  products: Product[],
  category?: string,
  search?: string,
  includeHidden = false,
  includeTrashed = false
) {
  const normalizedSearch = search?.trim().toLowerCase();

  return products.filter((product) => {
    if (!includeTrashed && product.isTrashed) return false;
    if (!includeHidden && !product.isPublished) return false;
    if (category && !product.categories.some((item) => item.slug === category)) return false;
    if (normalizedSearch && !product.name.toLowerCase().includes(normalizedSearch)) return false;
    return true;
  });
}

async function publicApiWithStaticFallback<T>(apiCall: () => Promise<T>, fallback: () => Promise<T>) {
  try {
    return await apiCall();
  } catch (error) {
    if (!import.meta.env.PROD) throw error;
    return fallback();
  }
}

export const api = {
  health: () => apiRequest<{ ok: boolean }>("/health"),
  sendCode: (phone: string) =>
    apiRequest<{ ok: true; expiresAt: string; devCode?: string }>("/auth/send-code", {
      method: "POST",
      body: JSON.stringify({ phone })
    }),
  verifyCode: (phone: string, code: string, profile?: { name?: string }) =>
    apiRequest<{ token: string; sessionToken: string; user: User }>("/auth/verify-code", {
      method: "POST",
      body: JSON.stringify({ phone, code, profile })
    }),
  adminLogin: (login: string, password: string) =>
    apiRequest<{ token: string; sessionToken: string; user: User }>("/auth/admin-login", {
      method: "POST",
      body: JSON.stringify({ login, password })
    }),
  dummyCustomerLogin: () =>
    apiRequest<{ token: string; sessionToken: string; user: User }>("/auth/dummy-customer", {
      method: "POST"
    }),
  refreshSession: (sessionToken: string) =>
    apiRequest<{ token: string; sessionToken: string; user: User }>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ sessionToken })
    }),
  logout: (sessionToken: string) =>
    apiRequest<void>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ sessionToken })
    }),
  me: () => apiRequest<{ user: User }>("/auth/me"),
  categories: async () => {
    const response = await publicApiWithStaticFallback(
      () => apiRequest<{ categories: Category[] }>("/categories"),
      async () => {
        const catalog = await loadStaticCatalog();
        return { categories: catalog.categories };
      }
    );
    return { categories: sortMenuCategories(response.categories) };
  },
  products: (category?: string, search?: string, includeHidden = false, includeTrashed = false) => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (search) params.set("search", search);
    if (includeHidden) params.set("includeHidden", "true");
    if (includeTrashed) params.set("includeTrashed", "true");
    const requestProducts = () => apiRequest<{ products: Product[] }>(`/products?${params.toString()}`);

    // Catalog management must never silently fall back to the static public
    // snapshot. Its product IDs may be stale, which makes edit/delete actions
    // target records that do not exist in the live database.
    if (includeHidden || includeTrashed) return requestProducts();

    return publicApiWithStaticFallback(
      requestProducts,
      async () => {
        const catalog = await loadStaticCatalog();
        return { products: filterStaticProducts(catalog.products, category, search, includeHidden, includeTrashed) };
      }
    );
  },
  publicSettings: async () => {
    const response = await apiRequest<{ settings: Record<string, string> }>("/settings/public");
    return {
      settings: {
        deliveryFee: Number(response.settings.deliveryFee ?? 0),
        minimumDeliveryOrderAmount: Number(response.settings.minimumDeliveryOrderAmount ?? 0),
        pickupEnabled: response.settings.pickupEnabled !== "false",
        deliveryEnabled: response.settings.deliveryEnabled !== "false",
        deliveryZones: parseDeliveryZones(response.settings.deliveryZones).filter((zone) => zone.isActive),
        whatsappStoreNumber: response.settings.whatsappStoreNumber,
        pwaInstallPrompt: response.settings.pwaInstallPrompt !== "false",
        storeLocation: {
          lat: Number(response.settings.storeLatitude),
          lng: Number(response.settings.storeLongitude)
        },
        maxDeliveryRadiusKm: Number(response.settings.maxDeliveryRadiusKm)
      } satisfies PublicSettings
    };
  },
  deliverySettings: () => apiRequest<{ settings: DeliverySettings }>("/delivery-settings"),
  reverseGeocode: (location: { lat: number; lng: number }) =>
    apiRequest<{ address: string }>(
      `/delivery/reverse-geocode?lat=${encodeURIComponent(location.lat)}&lng=${encodeURIComponent(location.lng)}`
    ),
  updateDeliverySettings: (payload: Partial<DeliverySettings>) =>
    apiRequest<{ settings: DeliverySettings }>("/delivery-settings", {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  settings: () => apiRequest<{ settings: Record<string, string> }>("/settings"),
  updateSettings: (payload: Record<string, string>) =>
    apiRequest<{ settings: Record<string, string> }>("/settings", {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  checkout: (payload: unknown) =>
    apiRequest<{ order: Order }>("/checkout", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  createCart: (sessionId: string) =>
    apiRequest<{ cart: ApiCart }>("/cart", {
      method: "POST",
      body: JSON.stringify({ sessionId })
    }),
  getCart: (cartId: string) => apiRequest<{ cart: ApiCart }>(`/cart/${encodeURIComponent(cartId)}`),
  addCartItem: (cartId: string, payload: { productId: string; quantity: number }) =>
    apiRequest<{ cart: ApiCart }>(`/cart/${encodeURIComponent(cartId)}/items`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateCartItemByProduct: (cartId: string, productId: string, quantity: number) =>
    apiRequest<{ cart: ApiCart }>(
      `/cart/${encodeURIComponent(cartId)}/items/by-product/${encodeURIComponent(productId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ quantity })
      }
    ),
  removeCartItemByProduct: (cartId: string, productId: string) =>
    apiRequest<{ cart: ApiCart }>(
      `/cart/${encodeURIComponent(cartId)}/items/by-product/${encodeURIComponent(productId)}`,
      {
        method: "DELETE"
      }
    ),
  replaceCartItems: (cartId: string, items: Array<{ productId: string; quantity: number }>) =>
    apiRequest<{ cart: ApiCart }>(`/cart/${encodeURIComponent(cartId)}/items`, {
      method: "PUT",
      body: JSON.stringify({ items })
    }),
  clearCart: (cartId: string) =>
    apiRequest<{ cart: ApiCart }>(`/cart/${encodeURIComponent(cartId)}`, {
      method: "DELETE"
    }),
  lastOrder: (sessionId: string) =>
    apiRequest<{ lines: Array<{ product: Product; quantity: number }> }>(
      `/cart/last-order/${encodeURIComponent(sessionId)}`
    ),
  gameScore: (sessionId: string) =>
    apiRequest<{ bestScore: number; playerName?: string | null }>(`/game-score/${encodeURIComponent(sessionId)}`),
  gameCampaign: () => apiRequest<GameCampaignState>("/game-campaign"),
  gameLeaderboard: ({ limit = 500, offset = 0 }: { limit?: number; offset?: number } = {}) =>
    apiRequest<GameLeaderboardResponse>(
      `/game-score/leaderboard?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`
    ),
  saveGameScore: (sessionId: string, score: number) =>
    apiRequest<GameScoreSaveResponse>("/game-score", {
      method: "POST",
      body: JSON.stringify({ sessionId, score })
    }),
  gameRecordVoucherRule: () =>
    apiRequest<{ rule: VoucherRule | null; currentRecord: GameRecordHolder | null }>("/admin/voucher-rules/game-record"),
  updateGameRecordVoucherRule: (payload: unknown) =>
    apiRequest<{ rule: VoucherRule }>("/admin/voucher-rules/game-record", {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  adminGameCampaigns: () =>
    apiRequest<{ mode: GameRewardMode; campaigns: GameCampaign[] }>("/admin/game-campaigns"),
  createGameCampaign: (payload: unknown) =>
    apiRequest<{ campaign: GameCampaign }>("/admin/game-campaigns", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateGameCampaign: (id: string, payload: unknown) =>
    apiRequest<{ campaign: GameCampaign }>(
      `/admin/game-campaigns/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        body: JSON.stringify(payload)
      }
    ),
  finalizeGameCampaign: (id: string) =>
    apiRequest<{ result: { campaignId: string; status: "finished"; issuedCount: number } }>(
      `/admin/game-campaigns/${encodeURIComponent(id)}/finalize`,
      { method: "POST" }
    ),
  cancelGameCampaign: (id: string) =>
    apiRequest<{ campaign: GameCampaign }>(
      `/admin/game-campaigns/${encodeURIComponent(id)}/cancel`,
      { method: "POST" }
    ),
  updateGameRewardMode: (mode: GameRewardMode) =>
    apiRequest<{ mode: GameRewardMode }>("/admin/game-reward-mode", {
      method: "PUT",
      body: JSON.stringify({ mode })
    }),
  adminVouchers: (params?: { search?: string; status?: string; source?: string; recipient?: string }) => {
    const search = new URLSearchParams();
    if (params?.search) search.set("search", params.search);
    if (params?.status && params.status !== "all") search.set("status", params.status);
    if (params?.source && params.source !== "all") search.set("source", params.source);
    if (params?.recipient) search.set("recipient", params.recipient);
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<{ vouchers: IssuedVoucher[] }>(`/admin/vouchers${suffix}`);
  },
  createVoucher: (payload: unknown) =>
    apiRequest<{ voucher: IssuedVoucher }>("/admin/vouchers", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  issueCurrentRecordVoucher: () =>
    apiRequest<{ voucher: IssuedVoucher }>("/admin/vouchers/issue-current-record", { method: "POST" }),
  approveVoucher: (id: string) =>
    apiRequest<{ voucher: IssuedVoucher }>(`/admin/vouchers/${encodeURIComponent(id)}/approve`, { method: "POST" }),
  revokeVoucher: (id: string) =>
    apiRequest<{ voucher: IssuedVoucher }>(`/admin/vouchers/${encodeURIComponent(id)}/revoke`, { method: "POST" }),
  validateVoucher: (payload: unknown) =>
    apiRequest<{ voucher: VoucherValidationResult }>("/vouchers/validate", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  myVouchers: (sessionId?: string) => {
    const suffix = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    return apiRequest<{ vouchers: IssuedVoucher[] }>(`/vouchers/mine${suffix}`);
  },
  trackOrder: (payload: { token: string } | { orderId: number; phone: string }) =>
    apiRequest<{ order: Order }>("/orders/track", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  trackOrderByToken: (token: string) => apiRequest<{ order: Order }>(`/orders/track/${encodeURIComponent(token)}`),
  orders: () => apiRequest<{ orders: Order[] }>("/orders"),
  updateOrderStatus: (id: number, status: string) =>
    apiRequest<{ order: Order }>(`/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    }),
  confirmKitchenOrder: (id: number) =>
    apiRequest<{ order: Order; customerNotification: CustomerOrderNotification }>(`/orders/${id}/kitchen-confirm`, {
      method: "POST"
    }),
  completeKitchenOrder: (id: number) =>
    apiRequest<{ order: Order }>(`/orders/${id}/kitchen-complete`, {
      method: "POST"
    }),
  assignOrder: (id: number, delivererId: string) =>
    apiRequest<{ order: Order }>(`/orders/${id}/assign`, {
      method: "PATCH",
      body: JSON.stringify({ delivererId })
    }),
  confirmAndDispatchOrder: (id: number, delivererId?: string) =>
    apiRequest<{ order: Order }>(`/orders/${id}/confirm-and-dispatch`, {
      method: "POST",
      body: JSON.stringify(delivererId ? { delivererId } : {})
    }),
  markPaid: (id: number) =>
    apiRequest<{ order: Order }>(`/orders/${id}/mark-paid`, {
      method: "POST"
    }),
  updateCourierLocation: (location: {
    lat: number;
    lng: number;
    accuracyMeters?: number | null;
    heading?: number | null;
    speedMps?: number | null;
    activeOrderId?: number | null;
  }) =>
    apiRequest<{ location: NonNullable<NonNullable<Order["deliveryTracking"]>["courierLocation"]> }>("/courier/location", {
      method: "POST",
      body: JSON.stringify(location)
    }),
  updateCourierDeliveryStage: (id: number, stage: "en_route" | "arrived") =>
    apiRequest<{ order: Order }>(`/orders/${id}/delivery-stage`, {
      method: "PATCH",
      body: JSON.stringify({ stage })
    }),
  users: () => apiRequest<{ users: User[] }>("/users"),
  createUser: (payload: unknown) =>
    apiRequest<{ user: User }>("/users", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateUser: (
    id: string,
    payload: Partial<User> & {
      password?: string;
    }
  ) =>
    apiRequest<{ user: User }>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  createProduct: (payload: unknown) =>
    apiRequest<{ product: Product }>("/products", { method: "POST", body: JSON.stringify(payload) }),
  updateProduct: (id: string, payload: unknown) =>
    apiRequest<{ product: Product }>(`/products/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  trashProduct: (id: string) =>
    apiRequest<void>(`/products/${id}`, { method: "DELETE" }),
  restoreProduct: (id: string) =>
    apiRequest<{ product: Product }>(`/products/${id}/restore`, { method: "POST" }),
  reorderProducts: async (productIds: string[]) => {
    await Promise.all(productIds.map((id, sortOrder) =>
      apiRequest<{ product: Product }>(`/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ sortOrder })
      })
    ));
  },
  uploadProductImages: (id: string, files: File[]) => {
    const body = new FormData();
    files.forEach((file) => body.append("images", file));
    return apiRequest<{ images: Product["images"] }>(`/products/${id}/images`, { method: "POST", body });
  },
  deleteProductImage: (productId: string, imageId: string) =>
    apiRequest<void>(`/products/${productId}/images/${imageId}`, { method: "DELETE" }),
  reorderProductImages: (productId: string, imageIds: string[]) =>
    apiRequest<{ images: Product["images"] }>(`/products/${productId}/images/reorder`, { method: "PATCH", body: JSON.stringify({ imageIds }) }),
  updateProductImage: (productId: string, imageId: string, altText: string | null) =>
    apiRequest<{ image: Product["images"][number] }>(`/products/${productId}/images/${imageId}`, { method: "PATCH", body: JSON.stringify({ altText }) }),
  createCategory: (payload: unknown) =>
    apiRequest<{ category: Category }>("/categories", { method: "POST", body: JSON.stringify(payload) }),
  updateCategory: (id: string, payload: unknown) =>
    apiRequest<{ category: Category }>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  reorderCategories: async (categoryIds: string[]) => {
    await Promise.all(categoryIds.map((id, sortOrder) =>
      apiRequest<{ category: Category }>(`/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ sortOrder })
      })
    ));
  },
  feedback: (payload: unknown) =>
    apiRequest<{ feedback: unknown }>("/feedback", { method: "POST", body: JSON.stringify(payload) }),
  shiftHandoverHealth: () => apiRequest<{ ok: boolean; service: string }>("/shift-handover/health"),
  shiftHandoverMe: () =>
    apiRequest<{
      user: User;
      profile: UserShiftProfile | null;
      templates: ShiftTemplate[];
      permissions: {
        canManage: boolean;
        canDelete: boolean;
        canManageSubscribers: boolean;
        canManageSchedule: boolean;
      };
    }>("/shift-handover/me"),
  shiftHandoverItems: (params?: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value) search.set(key, value);
    }
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<{ items: ShiftHandoverItem[] }>(`/shift-handover/items${suffix}`);
  },
  shiftHandoverItem: (id: string) => apiRequest<{ item: ShiftHandoverItem }>(`/shift-handover/items/${encodeURIComponent(id)}`),
  createShiftHandoverItem: (payload: FormData) =>
    apiRequest<{ item: ShiftHandoverItem; whatsapp?: { results: Array<{ status: string; waMeUrl?: string | null }> } | null }>("/shift-handover/items", {
      method: "POST",
      body: payload
    }),
  updateShiftHandoverItem: (id: string, payload: Partial<ShiftHandoverItem>) =>
    apiRequest<{ item: ShiftHandoverItem }>(`/shift-handover/items/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  commentShiftHandoverItem: (id: string, body: string) =>
    apiRequest<{ item: ShiftHandoverItem }>(`/shift-handover/items/${encodeURIComponent(id)}/comments`, {
      method: "POST",
      body: JSON.stringify({ body })
    }),
  acknowledgeShiftHandoverItem: (id: string) =>
    apiRequest<{ item: ShiftHandoverItem }>(`/shift-handover/items/${encodeURIComponent(id)}/acknowledge`, { method: "POST" }),
  resolveShiftHandoverItem: (id: string) =>
    apiRequest<{ item: ShiftHandoverItem }>(`/shift-handover/items/${encodeURIComponent(id)}/resolve`, { method: "POST" }),
  notifyShiftHandoverItem: (id: string, payload: { whatsappNumber?: string; subscribers?: boolean }) =>
    apiRequest<{ item: ShiftHandoverItem; whatsapp: { results: Array<{ status: string; waMeUrl?: string | null }> } }>(
      `/shift-handover/items/${encodeURIComponent(id)}/notify`,
      { method: "POST", body: JSON.stringify(payload) }
    ),
  deleteShiftHandoverItem: (id: string) =>
    apiRequest<void>(`/shift-handover/items/${encodeURIComponent(id)}`, { method: "DELETE" }),
  shiftHandoverAttachmentBlob: (id: string) => apiBlob(`/shift-handover/attachments/${encodeURIComponent(id)}/file`),
  deleteShiftHandoverAttachment: (id: string) =>
    apiRequest<void>(`/shift-handover/attachments/${encodeURIComponent(id)}`, { method: "DELETE" }),
  shiftHandoverSubscribers: () => apiRequest<{ subscribers: ShiftWhatsAppSubscriber[] }>("/shift-handover/subscribers"),
  createShiftHandoverSubscriber: (payload: Omit<ShiftWhatsAppSubscriber, "id" | "createdAt" | "updatedAt">) =>
    apiRequest<{ subscriber: ShiftWhatsAppSubscriber }>("/shift-handover/subscribers", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateShiftHandoverSubscriber: (id: string, payload: Partial<ShiftWhatsAppSubscriber>) =>
    apiRequest<{ subscriber: ShiftWhatsAppSubscriber }>(`/shift-handover/subscribers/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteShiftHandoverSubscriber: (id: string) =>
    apiRequest<void>(`/shift-handover/subscribers/${encodeURIComponent(id)}`, { method: "DELETE" }),
  shiftTemplates: () => apiRequest<{ templates: ShiftTemplate[] }>("/shift-handover/templates"),
  updateShiftTemplate: (id: string, payload: Partial<ShiftTemplate>) =>
    apiRequest<{ template: ShiftTemplate }>(`/shift-handover/templates/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  cleanupShiftHandoverUploads: () => apiRequest<{ checked: number; deleted: number; missing: number; failed: number }>("/shift-handover/cleanup-uploads", { method: "POST" }),
  shiftSchedule: (params?: { from?: string; to?: string; shiftKey?: string }) => {
    const search = new URLSearchParams();
    if (params?.from) search.set("from", params.from);
    if (params?.to) search.set("to", params.to);
    if (params?.shiftKey) search.set("shiftKey", params.shiftKey);
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return apiRequest<{ schedules: ShiftSchedule[] }>(`/shift-schedule${suffix}`);
  },
  createShiftSchedule: (payload: Partial<ShiftSchedule>) =>
    apiRequest<{ schedule: ShiftSchedule }>("/shift-schedule", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateShiftSchedule: (id: string, payload: Partial<ShiftSchedule>) =>
    apiRequest<{ schedule: ShiftSchedule }>(`/shift-schedule/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteShiftSchedule: (id: string) =>
    apiRequest<void>(`/shift-schedule/${encodeURIComponent(id)}`, { method: "DELETE" })
};
