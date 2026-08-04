import type { DeliveryType, OrderStatus } from "../../constants.js";

const terminal: OrderStatus[] = ["completed", "cancelled", "failed", "refunded"];

export function canTransition(current: OrderStatus, next: OrderStatus, deliveryType: DeliveryType) {
  if (current === next) return true;
  if (terminal.includes(current)) return false;

  const common: Partial<Record<OrderStatus, OrderStatus[]>> = {
    pending: ["confirmed", "cancelled", "failed"],
    confirmed: ["preparing", "cancelled"],
    preparing: deliveryType === "pickup" ? ["ready_for_pickup", "cancelled"] : ["out_for_delivery", "cancelled"],
    ready_for_pickup: ["completed", "cancelled"],
    out_for_delivery: ["completed", "failed"]
  };

  return common[current]?.includes(next) ?? false;
}
