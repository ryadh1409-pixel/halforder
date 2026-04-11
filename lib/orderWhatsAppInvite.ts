/**
 * WhatsApp share copy for inviting a friend to join an open HalfOrder.
 */

export function buildOrderInviteWhatsAppMessage(input: {
  orderId: string;
  foodType: string;
  size: string;
  restaurant: string;
  pricePerPerson: number;
  timeRemaining: string;
}): string {
  const id = input.orderId.trim();
  const web = `https://halforder.app/order/${id}`;
  const deep = `halforder://order/${id}`;
  return `🍕 Join my HalfOrder!
We're splitting a ${input.foodType} (${input.size}) from ${input.restaurant}

💰 Only $${input.pricePerPerson.toFixed(2)} per person

⏱ Hurry! ${input.timeRemaining} left

👉 Join here: ${deep}
${web}`;
}

export function openWhatsAppWithText(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
