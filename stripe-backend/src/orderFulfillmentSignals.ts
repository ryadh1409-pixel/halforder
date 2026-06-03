import {isOrderFulfilledForPaidPatch, type OrderPaidStateInput} from "./orderPaidState.js";

function hasTimestamp(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "object" && value !== null && "seconds" in value) {
    return true;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return true;
  }
  return false;
}

export function hasFulfillmentProgressMarkers(
  order: OrderPaidStateInput & Record<string, unknown>,
): boolean {
  if (
    hasTimestamp(order.acceptedAt) ||
    hasTimestamp(order.preparedAt) ||
    hasTimestamp(order.readyAt) ||
    hasTimestamp(order.pickedUpAt) ||
    hasTimestamp(order.deliveredAt)
  ) {
    return true;
  }
  return isOrderFulfilledForPaidPatch(order);
}
