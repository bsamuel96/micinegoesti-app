import { config } from "../../config.js";
import { Role, type DeliveryType, type OrderStatus, statusToApi, trackerSteps } from "../../constants.js";
import { generateOpaqueToken, hashToken } from "../../lib/auth.js";
import { HttpError } from "../../lib/http.js";
import { logError, logInfo, logWarn } from "../../lib/logger.js";
import { normalizePhone } from "../../lib/phone.js";
import { getSupabase } from "../../lib/supabase.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { buildWaMeUrl, isWhatsAppApiConfigured, sendWhatsAppMessage } from "../../services/whatsapp.js";
import {
  getDeliveryFeeForZone,
  getDeliveryZones,
  getMinimumDeliveryOrderAmount,
  getSetting
} from "../settings/settings.routes.js";
import { canTransition } from "./orderWorkflow.js";
import { getDeliveryLocationStatus, haversineDistanceKm, isValidCoordinates } from "../delivery/delivery-location.js";
import { validateVoucherForCheckout } from "../vouchers/vouchers.service.js";
import { roundMoney } from "../vouchers/voucher-calculation.js";

type CheckoutItem = {
  productId: string;
  quantity: number;
};

export type CheckoutInput = {
  cartId?: string;
  sessionId?: string;
  items?: CheckoutItem[];
  contact: {
    fullName: string;
    phone: string;
    address?: string;
  };
  orderType: DeliveryType;
  deliveryZoneId?: string;
  notes?: string;
  location?: {
    lat: number;
    lng: number;
  };
  voucherCode?: string | null;
};

type LineItem = {
  product: any;
  quantity: number;
  unitPrice: number;
};

type OrderRecord = any & {
  items?: any[];
  statusHistory?: any[];
  assignedDeliverer?: any;
  deliveryTracking?: DeliveryRouteTracking | null;
};

type DeliveryRouteOrder = {
  id: number | string;
  assigned_deliverer_id?: string | null;
  order_type?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  map_pin_lat?: number | string | null;
  map_pin_lng?: number | string | null;
};

export type CourierLocation = {
  lat: number;
  lng: number;
  accuracyMeters: number | null;
  heading: number | null;
  speedMps: number | null;
  recordedAt: string;
};

type DeliveryRouteTracking = {
  driverName: string | null;
  driverPhone: string | null;
  locationLabel: string;
  ordersAhead: number;
  routePosition: number | null;
  routeSize: number;
  isNextStop: boolean;
  distanceKm: number | null;
  courierLocation: CourierLocation | null;
  updatedAt: string | null;
};

type DelivererCandidate = {
  id: string;
  phone?: string | null;
  name?: string | null;
};

type AssignedDelivery = {
  assigned_deliverer_id?: string | null;
};

export type CustomerOrderNotification = {
  channel: "whatsapp";
  status: "sent" | "simulated" | "failed";
  message: string;
};

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function formatMoney(value: number) {
  return `${value.toFixed(2)} lei`;
}

function googleMapsLocationUrl(location?: { lat: number; lng: number } | null) {
  if (!location) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.lat},${location.lng}`)}`;
}

function routeTimestamp(value?: string | null) {
  return value ? new Date(value).getTime() : 0;
}

function routeOrderCoordinates(order: DeliveryRouteOrder) {
  const lat = Number(order.map_pin_lat);
  const lng = Number(order.map_pin_lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && isValidCoordinates({ lat, lng }) ? { lat, lng } : null;
}

function routeDistanceKm(order: DeliveryRouteOrder, courierLocation?: CourierLocation | null) {
  const destination = routeOrderCoordinates(order);
  return courierLocation && destination
    ? haversineDistanceKm({ lat: courierLocation.lat, lng: courierLocation.lng }, destination)
    : null;
}

function sortDeliveryRoute(a: DeliveryRouteOrder, b: DeliveryRouteOrder, courierLocation?: CourierLocation | null) {
  const firstDistance = routeDistanceKm(a, courierLocation);
  const secondDistance = routeDistanceKm(b, courierLocation);
  if (firstDistance != null && secondDistance != null && firstDistance !== secondDistance) {
    return firstDistance - secondDistance;
  }
  if (firstDistance != null && secondDistance == null) return -1;
  if (firstDistance == null && secondDistance != null) return 1;
  return routeTimestamp(a.created_at) - routeTimestamp(b.created_at) || Number(a.id) - Number(b.id);
}

function delivererPhone(order: OrderRecord) {
  const phone = order.assignedDeliverer?.phone;
  return phone && !phone.startsWith("staff-no-phone:") ? phone : null;
}

export function buildDeliveryRouteTracking(
  order: OrderRecord,
  routeOrders: DeliveryRouteOrder[] = [],
  courierLocation: CourierLocation | null = null
): DeliveryRouteTracking | null {
  if ((order.order_type as DeliveryType) !== "delivery") return null;

  const driverName = order.assignedDeliverer?.name ?? null;
  const driverPhone = delivererPhone(order);
  const terminalStatuses = ["completed", "cancelled", "failed", "refunded"];

  if (!order.assigned_deliverer_id && !order.assignedDeliverer) {
    return {
      driverName: null,
      driverPhone: null,
      locationLabel: "Curierul apare aici după ce restaurantul trimite comanda.",
      ordersAhead: 0,
      routePosition: null,
      routeSize: 0,
      isNextStop: false,
      distanceKm: null,
      courierLocation: null,
      updatedAt: order.updated_at ?? null
    };
  }

  if (terminalStatuses.includes(order.status)) {
    return {
      driverName,
      driverPhone,
      locationLabel: order.status === "completed" ? "Comanda a fost livrată." : "Livrarea nu mai este activă.",
      ordersAhead: 0,
      routePosition: null,
      routeSize: 0,
      isNextStop: false,
      distanceKm: null,
      courierLocation: null,
      updatedAt: order.updated_at ?? null
    };
  }

  if (order.status !== "out_for_delivery") {
    return {
      driverName,
      driverPhone,
      locationLabel: "Curierul este încă la restaurant sau așteaptă preluarea comenzii.",
      ordersAhead: 0,
      routePosition: null,
      routeSize: 0,
      isNextStop: false,
      distanceKm: null,
      courierLocation: null,
      updatedAt: order.updated_at ?? null
    };
  }

  const hasFreshLocation = courierLocation
    ? Date.now() - new Date(courierLocation.recordedAt).getTime() <= 2 * 60 * 1000
    : false;
  const activeCourierLocation = hasFreshLocation ? courierLocation : null;
  const sortedRoute = [...routeOrders].sort((a, b) => sortDeliveryRoute(a, b, activeCourierLocation));
  const routeIndex = sortedRoute.findIndex((routeOrder) => Number(routeOrder.id) === Number(order.id));
  const routePosition = routeIndex >= 0 ? routeIndex + 1 : null;
  const ordersAhead = routeIndex >= 0 ? routeIndex : 0;
  const isNextStop = routeIndex === 0;
  const distanceKm = routeIndex >= 0 ? routeDistanceKm(sortedRoute[routeIndex], activeCourierLocation) : null;

  return {
    driverName,
    driverPhone,
    locationLabel: routeIndex > 0
      ? "Curierul livrează opririle dinaintea ta."
      : distanceKm != null && distanceKm <= 0.15
        ? "Curierul a ajuns în apropierea adresei tale."
        : "Curierul este pe drum spre tine.",
    ordersAhead,
    routePosition,
    routeSize: sortedRoute.length,
    isNextStop,
    distanceKm: distanceKm == null ? null : Number(distanceKm.toFixed(2)),
    courierLocation: activeCourierLocation,
    updatedAt: hasFreshLocation
      ? courierLocation!.recordedAt
      : sortedRoute[routeIndex]?.updated_at ?? order.updated_at ?? null
  };
}

function buildCustomerOrderMessage(order: {
  id: number;
  contactName: string;
  phone: string;
  orderType: DeliveryType;
  address?: string | null;
  notes?: string | null;
  subtotal?: number;
  deliveryCost?: number;
  discountAmount?: number;
  voucherCode?: string | null;
  total: number;
  mapPin?: { lat: number; lng: number } | null;
  isOutsideDeliveryArea?: boolean;
  deliveryDistanceKm?: number | null;
  items: Array<{ name: string; quantity: number; totalPrice: number }>;
}) {
  const items = order.items
    .map((item) => `- ${item.quantity} x ${item.name} (${formatMoney(item.totalPrice)})`)
    .join("\n");

  return [
    `Bună! Confirm comanda #${order.id} la Mici de Negoești.`,
    `Nume: ${order.contactName}`,
    `Telefon: ${order.phone}`,
    `Tip comandă: ${order.orderType === "pickup" ? "Ridicare" : "Livrare"}`,
    order.address ? `Adresă: ${order.address}` : null,
    order.notes ? `Observații: ${order.notes}` : null,
    order.isOutsideDeliveryArea ? "⚠️ Locația este în afara razei obișnuite de livrare." : null,
    order.deliveryDistanceKm != null ? `Distanță aproximativă: ${order.deliveryDistanceKm.toFixed(1)} km` : null,
    order.mapPin ? `Coordonate: ${order.mapPin.lat}, ${order.mapPin.lng}` : null,
    order.mapPin ? `Hartă: ${googleMapsLocationUrl(order.mapPin)}` : null,
    "Produse:",
    items,
    order.subtotal != null ? `Subtotal produse: ${formatMoney(order.subtotal)}` : null,
    order.voucherCode && order.discountAmount ? `Voucher ${order.voucherCode}: -${formatMoney(order.discountAmount)}` : null,
    order.deliveryCost != null ? `Livrare: ${formatMoney(order.deliveryCost)}` : null,
    `Total: ${formatMoney(order.total)}`
  ]
    .filter(Boolean)
    .join("\n");
}

function buildStoreMessage(order: ReturnType<typeof serializeOrder>) {
  const items = order.items.map((item: { name: string; quantity: number }) => `- ${item.name} x${item.quantity}`).join("\n");
  return [
    `Comandă nouă #${order.id}`,
    `Nume: ${order.contactName}`,
    `Telefon: ${order.phone}`,
    `Tip: ${order.orderType === "pickup" ? "Ridicare" : "Livrare"}`,
    order.address ? `Adresă: ${order.address}` : null,
    order.isOutsideDeliveryArea ? "⚠️ ÎN AFARA ZONEI DE LIVRARE" : null,
    order.deliveryDistanceKm != null ? `Distanță aproximativă: ${order.deliveryDistanceKm.toFixed(1)} km` : null,
    order.mapPin ? `Coordonate: ${order.mapPin.lat}, ${order.mapPin.lng}` : null,
    order.mapPin ? `Hartă: ${googleMapsLocationUrl(order.mapPin)}` : null,
    order.notes ? `Observații: ${order.notes}` : null,
    `Subtotal produse: ${order.subtotal.toFixed(2)} RON`,
    order.voucherCode && order.discountAmount > 0 ? `Voucher ${order.voucherCode}: -${order.discountAmount.toFixed(2)} RON` : null,
    `Livrare: ${order.deliveryCost.toFixed(2)} RON`,
    `Total: ${order.total.toFixed(2)} RON`,
    "Produse:",
    items
  ]
    .filter(Boolean)
    .join("\n");
}

function buildCustomerConfirmationMessage(order: OrderRecord) {
  return [
    `Bună, ${order.contact_name || "client"}!`,
    `Comanda #${order.id} a fost confirmată de Mici de Negoești.`,
    "Bucătăria a început pregătirea comenzii.",
    order.order_type === "pickup"
      ? "Te anunțăm aici când este gata de ridicare."
      : "După ce este gata, comanda va fi predată curierului."
  ].join("\n");
}

async function notifyCustomerOrderConfirmed(order: OrderRecord): Promise<CustomerOrderNotification> {
  try {
    const result = await sendWhatsAppMessage({
      to: order.phone,
      body: buildCustomerConfirmationMessage(order)
    });
    const simulated = result.provider === "log";
    logInfo("whatsapp:order-confirmation:ok", {
      orderId: order.id,
      provider: result.provider,
      simulated
    });
    return {
      channel: "whatsapp",
      status: simulated ? "simulated" : "sent",
      message: simulated
        ? "Comanda a fost confirmată. Notificarea WhatsApp a fost simulată în acest mediu."
        : "Comanda a fost confirmată, iar clientul a fost notificat pe WhatsApp."
    };
  } catch (error) {
    logError("whatsapp:order-confirmation:failed", error, { orderId: order.id });
    return {
      channel: "whatsapp",
      status: "failed",
      message: "Comanda a fost confirmată, dar notificarea WhatsApp către client nu a putut fi trimisă."
    };
  }
}

export function serializeOrder(order: OrderRecord, trackingToken?: string, storeNumberOverride?: string) {
  const deliveryType = order.order_type as DeliveryType;
  const status = order.status as OrderStatus;
  const steps = trackerSteps(deliveryType);
  const currentStepIndex =
    ["cancelled", "failed", "refunded"].includes(order.status)
      ? -1
      : steps.findIndex((step) => step.code === status);

  const items =
    order.items?.map((item: any) => ({
      id: item.id,
      productId: item.product_id,
      name: item.name,
      quantity: item.quantity,
      unitPrice: toNumber(item.unit_price),
      totalPrice: toNumber(item.total_price)
    })) ?? [];
  const mapPin =
    order.map_pin_lat != null && order.map_pin_lng != null
      ? { lat: Number(order.map_pin_lat), lng: Number(order.map_pin_lng) }
      : null;
  const locationStatus =
    deliveryType === "delivery" && mapPin
      ? getDeliveryLocationStatus(
          { lat: config.delivery.storeLatitude, lng: config.delivery.storeLongitude },
          mapPin,
          config.delivery.maxRadiusKm
        )
      : null;

  const whatsappMessage =
    order.whatsapp_message ??
    buildCustomerOrderMessage({
      id: Number(order.id),
      contactName: order.contact_name,
      phone: order.phone,
      orderType: deliveryType,
      address: order.address,
      notes: order.notes,
      subtotal: toNumber(order.subtotal),
      deliveryCost: toNumber(order.delivery_cost),
      discountAmount: toNumber(order.discount_amount),
      voucherCode: order.voucher_code,
      total: toNumber(order.total),
      mapPin,
      isOutsideDeliveryArea: locationStatus?.isOutsideDeliveryArea,
      deliveryDistanceKm: locationStatus?.distanceKm,
      items
    });
  const storeNumber = storeNumberOverride ?? config.whatsapp.storeNumber ?? "";
  const statusHistory =
    order.statusHistory?.map((entry: any) => ({
      id: entry.id,
      fromStatus: entry.from_status ? statusToApi(entry.from_status as OrderStatus) : null,
      toStatus: statusToApi(entry.to_status as OrderStatus),
      note: entry.note,
      createdAt: entry.created_at
    })) ?? [];

  return {
    id: Number(order.id),
    orderNumber: Number(order.id),
    contactName: order.contact_name,
    phone: order.phone,
    address: order.address,
    orderType: deliveryType,
    deliveryType,
    deliveryLabel: deliveryType === "pickup" ? "Ridicare" : "Livrare",
    status: statusToApi(status),
    subtotal: toNumber(order.subtotal),
    deliveryCost: toNumber(order.delivery_cost),
    discountAmount: toNumber(order.discount_amount),
    voucherCode: order.voucher_code ?? null,
    voucher: order.voucher_id
      ? {
          id: order.voucher_id,
          code: order.voucher_code ?? null,
          discountAmount: toNumber(order.discount_amount)
        }
      : null,
    total: toNumber(order.total),
    paymentStatus: order.payment_status,
    paidAt: order.paid_at,
    deliveryStartedAt: order.delivery_started_at ?? null,
    courierArrivedAt: order.courier_arrived_at ?? null,
    notes: order.notes,
    mapPin,
    mapUrl: googleMapsLocationUrl(mapPin),
    deliveryDistanceKm: locationStatus ? Number(locationStatus.distanceKm.toFixed(2)) : null,
    isOutsideDeliveryArea: locationStatus?.isOutsideDeliveryArea ?? false,
    assignedDeliverer: order.assignedDeliverer
      ? {
          id: order.assignedDeliverer.id,
          name: order.assignedDeliverer.name,
          phone: order.assignedDeliverer.phone?.startsWith("staff-no-phone:") ? "" : order.assignedDeliverer.phone
        }
      : null,
    steps,
    currentStepIndex,
    items,
    statusHistory,
    statusLog: statusHistory,
    deliveryTracking: order.deliveryTracking ?? buildDeliveryRouteTracking(order),
    whatsappMessage,
    whatsappUrl: storeNumber ? buildWaMeUrl(storeNumber, whatsappMessage) : null,
    whatsappApiConfigured: isWhatsAppApiConfigured(),
    trackingToken,
    trackingUrl: trackingToken ? `/track?token=${encodeURIComponent(trackingToken)}` : null,
    createdAt: order.created_at,
    updatedAt: order.updated_at
  };
}

async function withDeliveryRouteTracking(orders: OrderRecord[]): Promise<OrderRecord[]> {
  if (!orders.length) return orders;

  const delivererIds = [
    ...new Set(
      orders
        .filter((order) => order.order_type === "delivery" && (order.assigned_deliverer_id || order.assignedDeliverer))
        .map((order) => order.assigned_deliverer_id ?? order.assignedDeliverer?.id)
        .filter(Boolean)
    )
  ];

  if (!delivererIds.length) {
    return orders.map((order) => ({
      ...order,
      deliveryTracking: buildDeliveryRouteTracking(order)
    }));
  }

  const [routeResult, locationsResult] = await Promise.all([
    getSupabase()
      .from("orders")
      .select("id, assigned_deliverer_id, order_type, status, created_at, updated_at, map_pin_lat, map_pin_lng")
      .in("assigned_deliverer_id", delivererIds)
      .eq("order_type", "delivery")
      .eq("status", "out_for_delivery")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    getSupabase()
      .from("courier_locations")
      .select("deliverer_id, latitude, longitude, accuracy_meters, heading, speed_mps, recorded_at")
      .in("deliverer_id", delivererIds)
  ]);
  if (routeResult.error) throw new HttpError(500, "Nu am putut calcula traseul curierului.", routeResult.error);
  if (locationsResult.error) throw new HttpError(500, "Nu am putut citi poziția curierului.", locationsResult.error);

  const routesByDeliverer = new Map<string, DeliveryRouteOrder[]>();
  for (const routeOrder of routeResult.data ?? []) {
    const delivererId = routeOrder.assigned_deliverer_id;
    if (!delivererId) continue;
    const list = routesByDeliverer.get(delivererId) ?? [];
    list.push(routeOrder);
    routesByDeliverer.set(delivererId, list);
  }
  const locationsByDeliverer = new Map<string, CourierLocation>();
  for (const location of locationsResult.data ?? []) {
    locationsByDeliverer.set(location.deliverer_id, {
      lat: Number(location.latitude),
      lng: Number(location.longitude),
      accuracyMeters: location.accuracy_meters == null ? null : Number(location.accuracy_meters),
      heading: location.heading == null ? null : Number(location.heading),
      speedMps: location.speed_mps == null ? null : Number(location.speed_mps),
      recordedAt: location.recorded_at
    });
  }

  return orders.map((order) => {
    const delivererId = order.assigned_deliverer_id ?? order.assignedDeliverer?.id;
    return {
      ...order,
      deliveryTracking: buildDeliveryRouteTracking(
        order,
        delivererId ? routesByDeliverer.get(delivererId) ?? [] : [],
        delivererId ? locationsByDeliverer.get(delivererId) ?? null : null
      )
    };
  });
}

export async function serializeOrderWithTracking(order: OrderRecord, trackingToken?: string, storeNumberOverride?: string) {
  const [trackedOrder] = await withDeliveryRouteTracking([order]);
  return serializeOrder(trackedOrder, trackingToken, storeNumberOverride);
}

async function productsById(productIds: string[]) {
  if (!productIds.length) return new Map<string, any>();
  const { data, error } = await getSupabase()
    .from("products")
    .select("id, name, price, is_active, in_stock")
    .in("id", productIds);
  if (error) throw new HttpError(500, "Nu am putut citi produsele.", error);
  return new Map((data ?? []).map((product) => [product.id, product]));
}

async function lineItemsFromInput(input: Pick<CheckoutInput, "cartId" | "items">) {
  if (input.cartId) {
    const { data, error } = await getSupabase()
      .from("app_cart_items")
      .select("product_id, quantity, unit_price")
      .eq("cart_id", input.cartId);
    if (error) throw new HttpError(500, "Nu am putut citi coșul.", error);
    if (!data?.length) throw new HttpError(400, "Coșul este gol.");

    const products = await productsById(data.map((item) => item.product_id));
    return data.map((item) => {
      const product = products.get(item.product_id);
      if (!product) throw new HttpError(404, `Produsul nu a fost găsit: ${item.product_id}`);
      if (product.is_active === false || product.in_stock === false) throw new HttpError(409, `${product.name} nu mai este disponibil momentan.`);
      return { product, quantity: item.quantity, unitPrice: toNumber(item.unit_price) };
    });
  }

  if (!input.items?.length) throw new HttpError(400, "Nu există produse în comandă.");

  const products = await productsById(input.items.map((item) => item.productId));
  return input.items.map((item) => {
    const product = products.get(item.productId);
    if (!product || product.is_active === false) throw new HttpError(404, `Produsul nu a fost găsit: ${item.productId}`);
    if (product.in_stock === false) throw new HttpError(409, `${product.name} nu mai este disponibil momentan.`);
    return { product, quantity: item.quantity, unitPrice: toNumber(product.price) };
  });
}

export async function getCheckoutPricing(input: Pick<CheckoutInput, "cartId" | "items" | "orderType" | "deliveryZoneId">) {
  const lines: LineItem[] = await lineItemsFromInput(input);
  const subtotal = roundMoney(lines.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  const deliveryZones = input.orderType === "delivery" ? await getDeliveryZones(false) : [];
  const deliveryZone = deliveryZones.find((zone) => zone.id === input.deliveryZoneId);
  const deliveryCost =
    input.orderType === "delivery"
      ? await getDeliveryFeeForZone(input.deliveryZoneId).catch((error) => {
          throw new HttpError(400, error instanceof Error ? error.message : "Zona de livrare nu este disponibilă.");
        })
      : 0;

  return {
    lines,
    subtotal,
    deliveryZones,
    deliveryZone,
    deliveryCost: roundMoney(deliveryCost)
  };
}

export function assertMinimumDeliveryOrderAmount(orderType: DeliveryType, subtotal: number, minimumAmount: number) {
  if (orderType !== "delivery" || minimumAmount <= 0 || subtotal >= minimumAmount) return;
  throw new HttpError(
    400,
    `Comanda minimă pentru livrare este ${formatMoney(minimumAmount)} în produse, fără taxa de livrare.`
  );
}

function checkoutPersistenceError(error: any) {
  const message = String(error?.message ?? "");
  const voucherMessages = [
    "Voucherul nu a fost găsit.",
    "Voucherul așteaptă aprobarea administratorului.",
    "Voucherul nu mai este activ.",
    "Voucherul a fost deja folosit.",
    "Voucherul nu este activ.",
    "Voucherul nu este încă activ.",
    "Voucherul a expirat.",
    "Voucherul aparține altui client.",
    "Voucherul aparține altei sesiuni.",
    "Subtotalul minim pentru voucher nu a fost atins."
  ];
  const matched = voucherMessages.find((candidate) => message.includes(candidate));
  return matched ? new HttpError(400, matched, error) : new HttpError(500, "Nu am putut salva comanda în Supabase.", error);
}

async function upsertCustomer(phone: string, name: string) {
  const { data: existing, error: findError } = await getSupabase()
    .from("users")
    .select('id, phone, email, name, role, "isActive"')
    .eq("phone", phone)
    .maybeSingle();
  if (findError) throw new HttpError(500, "Nu am putut citi utilizatorul.", findError);

  if (existing) {
    const { data, error } = await getSupabase()
      .from("users")
      .update({ name, isActive: true })
      .eq("id", existing.id)
      .select('id, phone, email, name, role, "isActive"')
      .single();
    if (error) throw new HttpError(500, "Nu am putut actualiza utilizatorul.", error);
    return data;
  }

  const { data, error } = await getSupabase()
    .from("users")
    .insert({ phone, name, role: Role.CUSTOMER, isActive: true })
    .select('id, phone, email, name, role, "isActive"')
    .single();
  if (error) throw new HttpError(500, "Nu am putut crea utilizatorul.", error);
  return data;
}

export async function getOrderRecord(orderId: number) {
  const { data: order, error } = await getSupabase().from("orders").select("*").eq("id", orderId).maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut citi comanda.", error);
  if (!order) throw new HttpError(404, "Comanda nu a fost găsită.");

  return (await hydrateOrderRecords([order]))[0];
}

async function hydrateOrderRecords(orders: any[]): Promise<OrderRecord[]> {
  if (!orders.length) return [];
  const orderIds = orders.map((order) => Number(order.id));
  const delivererIds = [...new Set(orders.map((order) => order.assigned_deliverer_id).filter(Boolean))];

  const [itemsResult, historyResult, deliverersResult] = await Promise.all([
    getSupabase().from("order_items").select("*").in("order_id", orderIds),
    getSupabase().from("order_status_history").select("*").in("order_id", orderIds).order("created_at", { ascending: true }),
    delivererIds.length
      ? getSupabase().from("users").select("id, phone, name").in("id", delivererIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (itemsResult.error) throw new HttpError(500, "Nu am putut citi produsele comenzii.", itemsResult.error);
  if (historyResult.error) throw new HttpError(500, "Nu am putut citi istoricul comenzii.", historyResult.error);
  if (deliverersResult.error) throw new HttpError(500, "Nu am putut citi livratorii.", deliverersResult.error);

  const itemsByOrder = new Map<number, any[]>();
  for (const item of itemsResult.data ?? []) {
    const list = itemsByOrder.get(Number(item.order_id)) ?? [];
    list.push(item);
    itemsByOrder.set(Number(item.order_id), list);
  }
  const historyByOrder = new Map<number, any[]>();
  for (const entry of historyResult.data ?? []) {
    const list = historyByOrder.get(Number(entry.order_id)) ?? [];
    list.push(entry);
    historyByOrder.set(Number(entry.order_id), list);
  }
  const deliverersById = new Map((deliverersResult.data ?? []).map((deliverer) => [deliverer.id, deliverer]));

  return orders.map((order) => ({
    ...order,
    items: itemsByOrder.get(Number(order.id)) ?? [],
    statusHistory: historyByOrder.get(Number(order.id)) ?? [],
    assignedDeliverer: order.assigned_deliverer_id ? deliverersById.get(order.assigned_deliverer_id) ?? null : null
  }));
}

export async function createCheckoutOrder(input: CheckoutInput, req: AuthenticatedRequest) {
  const phone = normalizePhone(input.contact.phone);
  const fullName = input.contact.fullName.trim();
  logInfo("checkout:start", {
    phone,
    orderType: input.orderType,
    cartId: input.cartId,
    sessionId: input.sessionId,
    itemCount: input.items?.length ?? 0
  });

  if (input.orderType === "delivery" && !input.contact.address?.trim()) {
    throw new HttpError(400, "Adresa este obligatorie pentru livrare.");
  }
  if (input.orderType === "delivery") {
    if (!isValidCoordinates(input.location)) throw new HttpError(400, "Selectează locația exactă pe hartă.");
    const locationStatus = getDeliveryLocationStatus(
      { lat: config.delivery.storeLatitude, lng: config.delivery.storeLongitude },
      input.location,
      config.delivery.maxRadiusKm
    );
    if (locationStatus.isOutsideDeliveryArea) {
      logWarn("checkout:outside-delivery-area", {
        distanceKm: Number(locationStatus.distanceKm.toFixed(2)),
        maxRadiusKm: config.delivery.maxRadiusKm
      });
    }
  }

  const { lines, subtotal, deliveryZone, deliveryCost } = await getCheckoutPricing(input);
  const minimumDeliveryOrderAmount = input.orderType === "delivery" ? await getMinimumDeliveryOrderAmount() : 0;
  assertMinimumDeliveryOrderAmount(input.orderType, subtotal, minimumDeliveryOrderAmount);
  const trackingToken = generateOpaqueToken(24);
  const deliveryAddress =
    input.orderType === "pickup"
      ? null
      : [input.contact.address?.trim(), deliveryZone ? `Zonă: ${deliveryZone.name}` : null].filter(Boolean).join(" · ");
  const customer = req.user ?? (await upsertCustomer(phone, fullName));
  const voucher = input.voucherCode?.trim()
    ? await validateVoucherForCheckout({
        code: input.voucherCode,
        subtotal,
        deliveryCost,
        userId: customer.id,
        sessionId: input.sessionId ?? null
      })
    : null;
  const discountAmount = voucher?.discountAmount ?? 0;
  const total = voucher?.finalTotal ?? roundMoney(subtotal + deliveryCost);
  const itemPayload = lines.map((line) => ({
    product_id: line.product.id,
    name: line.product.name,
    quantity: line.quantity,
    unit_price: line.unitPrice,
    total_price: roundMoney(line.unitPrice * line.quantity)
  }));
  const preview = buildCustomerOrderMessage({
    id: 0,
    contactName: fullName,
    phone,
    orderType: input.orderType,
    address: deliveryAddress,
    notes: input.notes,
    subtotal,
    deliveryCost,
    discountAmount,
    voucherCode: voucher?.code ?? null,
    total,
    mapPin: input.location ?? null,
    isOutsideDeliveryArea:
      input.orderType === "delivery" && input.location
        ? getDeliveryLocationStatus(
            { lat: config.delivery.storeLatitude, lng: config.delivery.storeLongitude },
            input.location,
            config.delivery.maxRadiusKm
          ).isOutsideDeliveryArea
        : false,
    deliveryDistanceKm:
      input.orderType === "delivery" && input.location
        ? getDeliveryLocationStatus(
            { lat: config.delivery.storeLatitude, lng: config.delivery.storeLongitude },
            input.location,
            config.delivery.maxRadiusKm
          ).distanceKm
        : null,
    items: itemPayload.map((item) => ({ name: item.name, quantity: item.quantity, totalPrice: item.total_price }))
  });

  const { data: orderId, error } = await getSupabase().rpc("create_checkout_order", {
    p_order_key_hash: hashToken(trackingToken),
    p_user_id: customer.id,
    p_contact_name: fullName,
    p_phone: phone,
    p_address: deliveryAddress,
    p_order_type: input.orderType,
    p_delivery_zone_id: input.orderType === "delivery" ? input.deliveryZoneId ?? null : null,
    p_map_pin_lat: input.location?.lat ?? null,
    p_map_pin_lng: input.location?.lng ?? null,
    p_subtotal: subtotal,
    p_delivery_cost: deliveryCost,
    p_total: total,
    p_notes: input.notes ?? null,
    p_whatsapp_message: preview.replace("#0", "#pending"),
    p_items: itemPayload,
    p_cart_id: input.cartId ?? null,
    p_last_session_key: input.sessionId ?? null,
    p_last_items: itemPayload.map((item) => ({ productId: item.product_id, quantity: item.quantity })),
    p_voucher_code: voucher?.code ?? input.voucherCode ?? null
  });
  if (error) throw checkoutPersistenceError(error);

  const message = buildCustomerOrderMessage({
    id: Number(orderId),
    contactName: fullName,
    phone,
    orderType: input.orderType,
    address: deliveryAddress,
    notes: input.notes,
    subtotal,
    deliveryCost,
    discountAmount,
    voucherCode: voucher?.code ?? null,
    total,
    mapPin: input.location ?? null,
    isOutsideDeliveryArea:
      input.orderType === "delivery" && input.location
        ? getDeliveryLocationStatus(
            { lat: config.delivery.storeLatitude, lng: config.delivery.storeLongitude },
            input.location,
            config.delivery.maxRadiusKm
          ).isOutsideDeliveryArea
        : false,
    deliveryDistanceKm:
      input.orderType === "delivery" && input.location
        ? getDeliveryLocationStatus(
            { lat: config.delivery.storeLatitude, lng: config.delivery.storeLongitude },
            input.location,
            config.delivery.maxRadiusKm
          ).distanceKm
        : null,
    items: itemPayload.map((item) => ({ name: item.name, quantity: item.quantity, totalPrice: item.total_price }))
  });
  await getSupabase().from("orders").update({ whatsapp_message: message }).eq("id", orderId);

  const order = await getOrderRecord(Number(orderId));
  const storeNumber = (await getSetting("whatsappStoreNumber")) || config.whatsapp.storeNumber;
  const serialized = await serializeOrderWithTracking({ ...order, whatsapp_message: message }, trackingToken, storeNumber);
  logInfo("checkout:created", {
    orderId,
    phone,
    total,
    storeNumberConfigured: Boolean(storeNumber),
    whatsappApiConfigured: isWhatsAppApiConfigured()
  });

  if (storeNumber) {
    try {
      const result = await sendWhatsAppMessage({ to: storeNumber, body: buildStoreMessage(serialized) });
      logInfo("whatsapp:notification:ok", { orderId, label: "store", result });
    } catch (error) {
      logError("whatsapp:notification:failed", error, { orderId, label: "store" });
    }
  } else {
    logWarn("whatsapp:store-missing", { orderId });
  }

  return serialized;
}

export async function getOrderByTrackingToken(token: string) {
  const { data, error } = await getSupabase()
    .from("orders")
    .select("id")
    .eq("order_key_hash", hashToken(token))
    .maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut citi comanda.", error);
  if (!data) throw new HttpError(404, "Comanda nu a fost găsită.");
  return serializeOrderWithTracking(await getOrderRecord(Number(data.id)), token, await getSetting("whatsappStoreNumber"));
}

export async function getOrderByNumberAndPhone(orderId: number, phoneInput: string) {
  const phone = normalizePhone(phoneInput);
  const { data, error } = await getSupabase().from("orders").select("id").eq("id", orderId).eq("phone", phone).maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut citi comanda.", error);
  if (!data) throw new HttpError(404, "Comanda nu a fost găsită.");
  return serializeOrderWithTracking(await getOrderRecord(Number(data.id)), undefined, await getSetting("whatsappStoreNumber"));
}

async function transitionOrderStatus(
  orderId: number,
  nextStatus: OrderStatus,
  changedByUserId?: string,
  note?: string,
  orderUpdates: Record<string, unknown> = {}
) {
  const order = await getOrderRecord(orderId);
  if (!canTransition(order.status as OrderStatus, nextStatus, order.order_type as DeliveryType)) {
    throw new HttpError(400, `Nu poți trece comanda din ${order.status} în ${nextStatus}.`);
  }
  if (order.status === nextStatus) {
    return {
      order: await serializeOrderWithTracking(order, undefined, await getSetting("whatsappStoreNumber")),
      customerNotification: null
    };
  }

  const { error: historyError } = await getSupabase().from("order_status_history").insert({
    order_id: orderId,
    from_status: order.status,
    to_status: nextStatus,
    changed_by_user_id: changedByUserId ?? null,
    note: note ?? null
  });
  if (historyError) throw new HttpError(500, "Nu am putut salva istoricul comenzii.", historyError);

  const { data: updated, error } = await getSupabase()
    .from("orders")
    .update({ ...orderUpdates, status: nextStatus })
    .eq("id", orderId)
    .eq("status", order.status)
    .select("id")
    .maybeSingle();
  if (error) throw new HttpError(500, "Nu am putut actualiza statusul comenzii.", error);
  if (!updated) {
    throw new HttpError(409, "Comanda a fost modificată între timp. Reîncarcă lista și încearcă din nou.");
  }

  const updatedOrder = await getOrderRecord(orderId);
  const [serialized, customerNotification] = await Promise.all([
    serializeOrderWithTracking(updatedOrder, undefined, await getSetting("whatsappStoreNumber")),
    nextStatus === "confirmed" ? notifyCustomerOrderConfirmed(updatedOrder) : Promise.resolve(null)
  ]);
  return { order: serialized, customerNotification };
}

export async function updateOrderStatus(orderId: number, nextStatus: OrderStatus, changedByUserId?: string, note?: string) {
  return (await transitionOrderStatus(orderId, nextStatus, changedByUserId, note)).order;
}

async function activeDeliverer(delivererId?: string) {
  let query = getSupabase().from("users").select('id, phone, name, role, "isActive"').eq("role", Role.DELIVERER).eq("isActive", true);
  if (delivererId) query = query.eq("id", delivererId);
  const { data, error } = await query;
  if (error) throw new HttpError(500, "Nu am putut citi curierii activi.", error);
  return data ?? [];
}

export function pickLeastBusyDeliverer(
  candidates: DelivererCandidate[],
  activeDeliveries: AssignedDelivery[]
) {
  const activeCount = new Map<string, number>();
  for (const order of activeDeliveries) {
    if (!order.assigned_deliverer_id) continue;
    activeCount.set(order.assigned_deliverer_id, (activeCount.get(order.assigned_deliverer_id) ?? 0) + 1);
  }

  return [...candidates].sort((first, second) => {
    const loadDifference = (activeCount.get(first.id) ?? 0) - (activeCount.get(second.id) ?? 0);
    if (loadDifference !== 0) return loadDifference;
    const nameDifference = (first.name || first.phone || "").localeCompare(second.name || second.phone || "", "ro");
    return nameDifference || first.id.localeCompare(second.id);
  })[0] ?? null;
}

async function delivererForCompletedKitchenOrder(order: OrderRecord) {
  if (order.assigned_deliverer_id) {
    const [assigned] = await activeDeliverer(order.assigned_deliverer_id);
    if (assigned) return assigned;
  }

  const candidates = await activeDeliverer();
  if (!candidates.length) {
    throw new HttpError(
      409,
      "Nu există niciun curier activ. Activează un curier înainte de a marca această comandă ca gata."
    );
  }

  const candidateIds = candidates.map((candidate) => candidate.id);
  const { data: activeDeliveries, error } = await getSupabase()
    .from("orders")
    .select("assigned_deliverer_id")
    .eq("order_type", "delivery")
    .eq("status", "out_for_delivery")
    .in("assigned_deliverer_id", candidateIds);
  if (error) throw new HttpError(500, "Nu am putut calcula disponibilitatea curierilor.", error);

  return pickLeastBusyDeliverer(candidates, activeDeliveries ?? [])!;
}

export async function confirmKitchenOrder(orderId: number, changedByUserId: string) {
  const existing = await getOrderRecord(orderId);
  if (existing.status !== "pending") {
    throw new HttpError(409, "Doar comenzile noi pot fi confirmate de bucătărie.");
  }

  const confirmed = await transitionOrderStatus(
    orderId,
    "confirmed",
    changedByUserId,
    "Comandă confirmată de bucătărie."
  );
  const preparing = await transitionOrderStatus(
    orderId,
    "preparing",
    changedByUserId,
    "Bucătăria a început pregătirea comenzii."
  );

  return {
    order: preparing.order,
    customerNotification: confirmed.customerNotification!
  };
}

export async function completeKitchenOrder(orderId: number, changedByUserId: string) {
  let order = await getOrderRecord(orderId);
  if (!["confirmed", "preparing"].includes(order.status)) {
    throw new HttpError(409, "Doar comenzile aflate în preparare pot fi marcate ca gata.");
  }

  const deliverer = order.order_type === "delivery"
    ? await delivererForCompletedKitchenOrder(order)
    : null;

  if (order.status === "confirmed") {
    await transitionOrderStatus(
      orderId,
      "preparing",
      changedByUserId,
      "Bucătăria a început pregătirea comenzii."
    );
    order = await getOrderRecord(orderId);
  }

  const nextStatus: OrderStatus = order.order_type === "pickup" ? "ready_for_pickup" : "out_for_delivery";
  const result = await transitionOrderStatus(
    orderId,
    nextStatus,
    changedByUserId,
    deliverer
      ? `Comandă gata și predată curierului ${deliverer.name || deliverer.phone || "asignat"}.`
      : "Comandă gata pentru ridicare.",
    deliverer ? { assigned_deliverer_id: deliverer.id } : {}
  );

  return { order: result.order };
}

export async function confirmAndDispatchOrder(orderId: number, changedByUserId: string, requestedDelivererId?: string) {
  const order = await getOrderRecord(orderId);
  if (order.status !== "pending") {
    throw new HttpError(409, "Doar comenzile noi pot fi confirmate.");
  }

  if (order.order_type === "pickup") {
    return updateOrderStatus(orderId, "confirmed", changedByUserId, "Comandă confirmată de restaurant.");
  }

  const candidates = await activeDeliverer(requestedDelivererId);
  let deliverer = candidates[0];
  if (requestedDelivererId && !deliverer) {
    throw new HttpError(400, "Curierul selectat nu este activ.");
  }
  if (!requestedDelivererId) {
    if (!candidates.length) throw new HttpError(409, "Nu există niciun curier activ pentru această comandă.");
    if (candidates.length > 1) throw new HttpError(409, "Selectează curierul care preia comanda.");
  }

  return (
    await transitionOrderStatus(
      orderId,
      "confirmed",
      changedByUserId,
      `Comandă confirmată și rezervată curierului ${deliverer.name || deliverer.phone || "asignat"}.`,
      { assigned_deliverer_id: deliverer.id }
    )
  ).order;
}

export async function markOrderPaid(orderId: number, req: AuthenticatedRequest, note?: string) {
  const order = await getOrderRecord(orderId);
  const mayUpdate =
    req.user?.role === Role.ADMIN ||
    req.user?.role === Role.STORE_MANAGER ||
    (req.user?.role === Role.DELIVERER && order.assigned_deliverer_id === req.user.id);

  if (!mayUpdate) throw new HttpError(403, "Nu poți marca această comandă ca plătită.");
  if (req.user?.role === Role.DELIVERER && (order.status !== "out_for_delivery" || !order.courier_arrived_at)) {
    throw new HttpError(409, "Confirmă mai întâi sosirea la adresa clientului.");
  }

  const paidAt = new Date().toISOString();
  const { error: paymentError } = await getSupabase()
    .from("payments")
    .update({ status: "paid", paid_at: paidAt, marked_by_user_id: req.user?.id ?? null, note: note ?? null })
    .eq("order_id", orderId);
  if (paymentError) throw new HttpError(500, "Nu am putut marca plata.", paymentError);

  const { error } = await getSupabase().from("orders").update({ paid_at: paidAt, payment_status: "paid" }).eq("id", orderId);
  if (error) throw new HttpError(500, "Nu am putut actualiza comanda.", error);
  return serializeOrderWithTracking(await getOrderRecord(orderId), undefined, await getSetting("whatsappStoreNumber"));
}

export async function updateCourierDeliveryStage(
  orderId: number,
  delivererId: string,
  stage: "en_route" | "arrived"
) {
  const order = await getOrderRecord(orderId);
  if (
    order.assigned_deliverer_id !== delivererId ||
    order.order_type !== "delivery" ||
    order.status !== "out_for_delivery"
  ) {
    throw new HttpError(403, "Comanda nu este o livrare activă asignată acestui curier.");
  }

  const timestamp = new Date().toISOString();
  const updates = stage === "arrived"
    ? {
        delivery_started_at: order.delivery_started_at ?? timestamp,
        courier_arrived_at: order.courier_arrived_at ?? timestamp
      }
    : { delivery_started_at: order.delivery_started_at ?? timestamp };
  const { error } = await getSupabase().from("orders").update(updates).eq("id", orderId);
  if (error) throw new HttpError(500, "Nu am putut salva progresul livrării.", error);

  return serializeOrderWithTracking(await getOrderRecord(orderId), undefined, await getSetting("whatsappStoreNumber"));
}

export async function updateCourierLocation(
  delivererId: string,
  location: {
    lat: number;
    lng: number;
    accuracyMeters?: number | null;
    heading?: number | null;
    speedMps?: number | null;
    activeOrderId?: number | null;
  }
) {
  if (!isValidCoordinates(location)) throw new HttpError(400, "Poziția curierului nu este validă.");

  if (location.activeOrderId != null) {
    const order = await getOrderRecord(location.activeOrderId);
    if (
      order.assigned_deliverer_id !== delivererId ||
      order.order_type !== "delivery" ||
      order.status !== "out_for_delivery"
    ) {
      throw new HttpError(403, "Comanda activă nu este asignată acestui curier.");
    }
  }

  const recordedAt = new Date().toISOString();
  const { error } = await getSupabase().from("courier_locations").upsert({
    deliverer_id: delivererId,
    active_order_id: location.activeOrderId ?? null,
    latitude: location.lat,
    longitude: location.lng,
    accuracy_meters: location.accuracyMeters ?? null,
    heading: location.heading ?? null,
    speed_mps: location.speedMps ?? null,
    recorded_at: recordedAt
  }, { onConflict: "deliverer_id" });
  if (error) throw new HttpError(500, "Nu am putut salva poziția curierului.", error);

  return {
    lat: location.lat,
    lng: location.lng,
    accuracyMeters: location.accuracyMeters ?? null,
    heading: location.heading ?? null,
    speedMps: location.speedMps ?? null,
    recordedAt
  } satisfies CourierLocation;
}

export function canReadOrder(req: AuthenticatedRequest, order: any) {
  if (!req.user) return false;
  if (req.user.role === Role.ADMIN || req.user.role === Role.STORE_MANAGER) return true;
  if (req.user.role === Role.KITCHEN) {
    return ["pending", "confirmed", "preparing", "ready_for_pickup", "out_for_delivery"].includes(order.status);
  }
  if (req.user.role === Role.DELIVERER) return order.assigned_deliverer_id === req.user.id;
  return order.user_id === req.user.id;
}

export async function listOrdersForRole(req: AuthenticatedRequest, status?: OrderStatus) {
  if (!req.user) return [];
  let query = getSupabase().from("orders").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (req.user.role === Role.KITCHEN) {
    query = query.in("status", ["pending", "confirmed", "preparing", "ready_for_pickup", "out_for_delivery"]);
  }
  if (req.user.role === Role.DELIVERER) query = query.eq("assigned_deliverer_id", req.user.id);
  if (req.user.role === Role.CUSTOMER) query = query.eq("user_id", req.user.id);

  const { data, error } = await query;
  if (error) throw new HttpError(500, "Nu am putut citi comenzile.", error);
  const [records, storeNumber] = await Promise.all([
    hydrateOrderRecords(data ?? []),
    getSetting("whatsappStoreNumber")
  ]);
  return (await withDeliveryRouteTracking(records)).map((order) => serializeOrder(order, undefined, storeNumber));
}
