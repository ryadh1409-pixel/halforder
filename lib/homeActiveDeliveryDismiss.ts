import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@halforder/homeActiveDeliveryDismissed';

/** Persist which order ids the user collapsed to the floating bubble. */
export async function readDismissedHomeActiveOrders(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
    );
  } catch {
    return new Set();
  }
}

export async function setHomeActiveOrderDismissed(
  orderId: string,
  dismissed: boolean,
): Promise<void> {
  const id = orderId.trim();
  if (!id) return;
  const current = await readDismissedHomeActiveOrders();
  if (dismissed) current.add(id);
  else current.delete(id);
  await AsyncStorage.setItem(KEY, JSON.stringify([...current]));
}
