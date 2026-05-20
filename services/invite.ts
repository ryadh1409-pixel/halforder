/**
 * WhatsApp share — English copy + web deep link.
 */
import * as Linking from 'expo-linking';

const OURFOOD_ORDER_BASE = 'https://ourfood.app/order';

function buildMessage(orderId: string): string {
  const id = orderId.trim();
  return `🍔 Someone wants to split this order with you!\nSave money 💰\nJoin here:\n${OURFOOD_ORDER_BASE}/${encodeURIComponent(id)}`;
}

/**
 * Opens WhatsApp with prefilled share message.
 * @returns whether `openURL` was attempted without throw
 */
export async function sendWhatsAppInvite(orderId: string): Promise<boolean> {
  const id = orderId.trim();
  if (!id) return false;
  const text = encodeURIComponent(buildMessage(id));
  const url = `https://wa.me/?text=${text}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
