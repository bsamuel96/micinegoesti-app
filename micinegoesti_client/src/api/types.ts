export type Category = {
  id: string;
  slug: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
};

export type Product = {
  id: string;
  externalId?: number;
  slug: string;
  name: string;
  description?: string | null;
  shortDescription?: string | null;
  productCode?: string | null;
  isHouseSpecialty?: boolean;
  price: number;
  imageUrl?: string | null;
  legacyImageUrl?: string | null;
  isPublished: boolean;
  isAvailable: boolean;
  isTrashed?: boolean;
  trashedAt?: string | null;
  allergenCodes?: number[];
  crossSellProductIds?: string[];
  sortOrder: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  images: Array<{
    id: string;
    url: string;
    storagePath?: string | null;
    thumbnailUrl?: string | null;
    legacyImageUrl?: string | null;
    alt?: string | null;
    sortOrder: number;
    width?: number | null;
    height?: number | null;
    fileSize?: number | null;
    mimeType?: string | null;
  }>;
  categories: Category[];
};

export type DeliverySettings = {
  deliveryFee: number;
  minimumDeliveryOrderAmount: number;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  deliveryZones: DeliveryZone[];
};

export type PublicSettings = DeliverySettings & {
  whatsappStoreNumber?: string;
  pwaInstallPrompt: boolean;
  storeLocation: { lat: number; lng: number };
  maxDeliveryRadiusKm: number;
};

export type DeliveryZone = {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  sortOrder: number;
  description?: string | null;
};

export type User = {
  id: string;
  phone: string;
  email?: string | null;
  name?: string | null;
  role: "customer" | "admin" | "store_manager" | "kitchen" | "shift_staff" | "deliverer";
  isActive: boolean;
  shiftProfile?: UserShiftProfile | null;
};

export type ShiftKey = "shift_1" | "shift_2";
export type ShiftPriority = "low" | "normal" | "high" | "urgent";
export type ShiftHandoverStatus = "new" | "seen" | "in_progress" | "resolved" | "archived";
export type ShiftHandoverCategory =
  | "cleaning"
  | "stock"
  | "equipment"
  | "customer_issue"
  | "food_quality"
  | "safety"
  | "handover"
  | "staff"
  | "other";

export type ShiftTemplate = {
  id: string;
  shiftKey: ShiftKey;
  label: string;
  defaultStartTime?: string | null;
  defaultEndTime?: string | null;
  color?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserShiftProfile = {
  id: string;
  userId: string;
  shiftKey?: ShiftKey | null;
  displayName?: string | null;
  whatsappNumber?: string | null;
  notificationsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ShiftHandoverAttachment = {
  id: string;
  handoverItemId: string;
  originalFilename?: string | null;
  mimeType: string;
  sizeBytes: number;
  sha256?: string | null;
  caption?: string | null;
  expiresAt: string;
  deletedAt?: string | null;
  deleteReason?: string | null;
  createdAt: string;
  isDeleted: boolean;
  isExpired: boolean;
  isAvailable: boolean;
};

export type ShiftHandoverComment = {
  id: string;
  handoverItemId: string;
  createdByUserId?: string | null;
  body: string;
  createdAt: string;
};

export type ShiftWhatsAppNotification = {
  id: string;
  handoverItemId?: string | null;
  subscriberId?: string | null;
  toNumber: string;
  provider: string;
  status: "queued" | "sent" | "failed" | "manual_required" | "skipped";
  messagePreview?: string | null;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  sentAt?: string | null;
};

export type ShiftHandoverItem = {
  id: string;
  code: string;
  createdByUserId?: string | null;
  sourceShiftKey: ShiftKey;
  targetShiftKey?: ShiftKey | null;
  category: ShiftHandoverCategory;
  priority: ShiftPriority;
  locationLabel?: string | null;
  title: string;
  description?: string | null;
  status: ShiftHandoverStatus;
  acknowledgedByUserId?: string | null;
  acknowledgedAt?: string | null;
  resolvedByUserId?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  photoCount: number;
  commentCount: number;
  attachments: ShiftHandoverAttachment[];
  comments: ShiftHandoverComment[];
  notifications?: ShiftWhatsAppNotification[];
};

export type ShiftWhatsAppSubscriber = {
  id: string;
  userId?: string | null;
  displayName: string;
  whatsappNumber: string;
  shiftFilter: "all" | ShiftKey;
  priorityFilter: "all" | "high_urgent" | "urgent_only";
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ShiftSchedule = {
  id: string;
  scheduleDate: string;
  shiftKey: ShiftKey;
  assignedUserId?: string | null;
  managerUserId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  status: "planned" | "confirmed" | "completed" | "cancelled";
  notes?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderStatus = {
  code: string;
  label: string;
};

export type OrderItem = {
  id: string;
  productId?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type Order = {
  id: number;
  orderNumber: number;
  contactName: string;
  phone: string;
  address?: string | null;
  orderType: "delivery" | "pickup";
  deliveryLabel: string;
  deliveryType: "delivery" | "pickup";
  status: OrderStatus;
  subtotal: number;
  deliveryCost: number;
  discountAmount: number;
  voucherCode?: string | null;
  voucher?: {
    id: string;
    code?: string | null;
    discountAmount: number;
  } | null;
  total: number;
  paymentStatus: string;
  paidAt?: string | null;
  deliveryStartedAt?: string | null;
  courierArrivedAt?: string | null;
  notes?: string | null;
  mapPin?: { lat: number; lng: number } | null;
  mapUrl?: string | null;
  deliveryDistanceKm?: number | null;
  isOutsideDeliveryArea?: boolean;
  assignedDeliverer?: Pick<User, "id" | "name" | "phone"> | null;
  deliveryTracking?: {
    driverName: string | null;
    driverPhone: string | null;
    locationLabel: string;
    ordersAhead: number;
    routePosition: number | null;
    routeSize: number;
    isNextStop: boolean;
    distanceKm: number | null;
    courierLocation: {
      lat: number;
      lng: number;
      accuracyMeters: number | null;
      heading: number | null;
      speedMps: number | null;
      recordedAt: string;
    } | null;
    updatedAt: string | null;
  } | null;
  steps: Array<{ code: string; label: string }>;
  currentStepIndex: number;
  items: OrderItem[];
  statusHistory: Array<{ id: string; fromStatus: OrderStatus | null; toStatus: OrderStatus; note?: string; createdAt: string }>;
  statusLog: Array<{ id: string; fromStatus: OrderStatus | null; toStatus: OrderStatus; note?: string; createdAt: string }>;
  whatsappMessage?: string | null;
  whatsappUrl?: string | null;
  whatsappApiConfigured?: boolean;
  trackingToken?: string;
  trackingUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerOrderNotification = {
  channel: "whatsapp";
  status: "sent" | "simulated" | "failed";
  message: string;
};

export type CartLine = {
  product: Product;
  quantity: number;
};

export type ApiCart = {
  id: string;
  sessionId?: string | null;
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    product: Product;
  }>;
  totals: {
    subtotal: number;
    total: number;
  };
};

export type GameScore = {
  id: string;
  playerName: string;
  bestScore: number;
  updatedAt: string;
};

export type GameRewardMode = "campaign" | "instant_record";
export type GameCampaignStatus = "scheduled" | "active" | "finished" | "cancelled";

export type GameCampaign = {
  id: string;
  name: string;
  status: GameCampaignStatus;
  startsAt: string;
  endsAt: string;
  prizes: [number, number, number];
  maximumDiscount?: number | null;
  minimumSubtotal: number;
  validityDays?: number | null;
  codePrefix: string;
  participantCount?: number;
  finishedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GameCampaignState = {
  mode: GameRewardMode;
  serverTime: string;
  campaign: GameCampaign | null;
};

export type GameLeaderboardResponse = GameCampaignState & {
  scores: GameScore[];
  total: number;
  hasMore: boolean;
};

export type VoucherDiscountType = "percentage" | "fixed_amount";
export type VoucherStatus = "pending" | "active" | "redeemed" | "revoked" | "expired";
export type VoucherSourceType = "manual" | "game_record" | "game_campaign";

export type VoucherReward = {
  status: "pending" | "active";
  code?: string;
  discountType: VoucherDiscountType;
  discountValue: number;
  maximumDiscount?: number | null;
  minimumSubtotal: number;
  expiresAt?: string | null;
  message: string;
};

export type GameScoreSaveResponse = {
  bestScore: number;
  playerName?: string | null;
  sessionId?: string;
  isNewGlobalRecord: boolean;
  reward?: VoucherReward;
  campaign?: Pick<GameCampaign, "id" | "name" | "status" | "startsAt" | "endsAt"> | null;
};

export type GameRecordHolder = {
  id: string;
  playerName?: string | null;
  bestScore: number;
  user?: Pick<User, "id" | "name" | "phone" | "email"> | null;
  isAnonymousSession: boolean;
  sessionKey?: string | null;
  updatedAt: string;
};

export type VoucherRule = {
  id: string;
  name: string;
  triggerType: VoucherSourceType;
  discountType: VoucherDiscountType;
  discountValue: number;
  maximumDiscount?: number | null;
  minimumSubtotal: number;
  validityDays?: number | null;
  codePrefix: string;
  requiresApproval: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type IssuedVoucher = {
  id: string;
  ruleId?: string | null;
  code?: string | null;
  name: string;
  description?: string | null;
  status: VoucherStatus;
  sourceType: VoucherSourceType;
  recipient:
    | (Pick<User, "id" | "name" | "phone" | "email">)
    | { type: "public"; label: string }
    | { type: "session"; label: string; sessionKey: string };
  discountType: VoucherDiscountType;
  discountValue: number;
  maximumDiscount?: number | null;
  minimumSubtotal: number;
  validFrom: string;
  expiresAt?: string | null;
  maxRedemptions: number;
  redemptionCount: number;
  redemptions: Array<{
    id: string;
    orderId: number;
    discountAmount: number;
    finalTotal: number;
    redeemedAt: string;
  }>;
  gameScoreId?: string | null;
  campaignId?: string | null;
  campaignScoreId?: string | null;
  campaignRank?: number | null;
  sourceScore?: number | null;
  previousRecordScore?: number | null;
  approvedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VoucherValidationResult = {
  code: string;
  status: "active";
  discountType: VoucherDiscountType;
  discountValue: number;
  maximumDiscount?: number | null;
  minimumSubtotal: number;
  subtotal: number;
  discountAmount: number;
  deliveryCost: number;
  finalTotal: number;
  expiresAt?: string | null;
  message: string;
};
