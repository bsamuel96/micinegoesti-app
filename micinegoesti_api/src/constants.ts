export const Role = {
  CUSTOMER: "customer",
  ADMIN: "admin",
  STORE_MANAGER: "store_manager",
  KITCHEN: "kitchen",
  SHIFT_STAFF: "shift_staff",
  DELIVERER: "deliverer"
} as const;

export type Role = (typeof Role)[keyof typeof Role];
export const ROLE_VALUES = Object.values(Role) as [Role, ...Role[]];

export type DeliveryType = "delivery" | "pickup";
export type PaymentStatus = "unpaid" | "paid" | "refunded";
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready_for_pickup"
  | "out_for_delivery"
  | "completed"
  | "cancelled"
  | "failed"
  | "refunded";

export const CATEGORY_SEED = [
  { slug: "specialitatea-casei", label: "Specialitatea Casei" },
  { slug: "grill", label: "Grill" },
  { slug: "meniuri", label: "Meniuri" },
  { slug: "ciorbe", label: "Ciorbe" },
  { slug: "toping", label: "Toping" },
  { slug: "sosuri", label: "Sosuri" },
  { slug: "garnituri", label: "Garnituri" },
  { slug: "salate", label: "Salate" },
  { slug: "platouri", label: "Platouri" },
  { slug: "peste", label: "Pește" },
  { slug: "desert", label: "Desert" },
  { slug: "racoritoare", label: "Răcoritoare" },
  { slug: "cafea", label: "Cafea" },
  { slug: "bere", label: "Bere" },
  { slug: "vin", label: "Vin" },
  { slug: "bauturi-alcoolice", label: "Băuturi alcoolice" },
  { slug: "1-metru-de-bere", label: "1 metru de BERE" }
];

export const SETTING_DEFAULTS = {
  deliveryFee: "7",
  minimumDeliveryOrderAmount: "0",
  deliveryZones: JSON.stringify([
    { id: "negoiesti", name: "Negoiești", price: 7, isActive: true, sortOrder: 0 }
  ]),
  pickupEnabled: "true",
  deliveryEnabled: "true",
  whatsappStoreNumber: "+40747232306",
  whatsappSenderNumber: "",
  restaurantSchedule:
    JSON.stringify({ mondaySaturday: "09:00-21:00", sunday: "07:00-19:00" }),
  pwaInstallPrompt: "true",
  paymentCashEnabled: "true"
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Comandă plasată",
  confirmed: "Confirmată",
  preparing: "În preparare",
  ready_for_pickup: "Gata de ridicare",
  out_for_delivery: "În livrare",
  completed: "Finalizată",
  cancelled: "Anulată",
  failed: "Eșuată",
  refunded: "Rambursată"
};

export const ORDER_STATUS_API_CODES: Record<OrderStatus, string> = {
  pending: "pending",
  confirmed: "confirmed",
  preparing: "preparing",
  ready_for_pickup: "ready_for_pickup",
  out_for_delivery: "out_for_delivery",
  completed: "completed",
  cancelled: "cancelled",
  failed: "failed",
  refunded: "refunded"
};

export function statusFromApi(value: string): OrderStatus {
  const normalized = value.replaceAll("-", "_") as OrderStatus;
  const allowed = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];

  if (!allowed.includes(normalized)) {
    throw new Error(`Unknown order status: ${value}`);
  }

  return normalized;
}

export function statusToApi(status: OrderStatus) {
  return {
    code: ORDER_STATUS_API_CODES[status],
    label: ORDER_STATUS_LABELS[status]
  };
}

export function trackerSteps(type: DeliveryType) {
  const common = [
    { code: "pending", label: "Comandă plasată" },
    { code: "confirmed", label: "Confirmată" },
    { code: "preparing", label: "În preparare" }
  ];

  if (type === "pickup") {
    return [
      ...common,
      { code: "ready_for_pickup", label: "Gata de ridicare" },
      { code: "completed", label: "Ridicată" }
    ];
  }

  return [
    ...common,
    { code: "out_for_delivery", label: "În livrare" },
    { code: "completed", label: "Livrată" }
  ];
}
