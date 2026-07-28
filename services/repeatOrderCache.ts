import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RepeatOrderCachePayload } from '@/types/repeatOrder';

const CACHE_KEY_PREFIX = '@ourfood/repeat_order_v1:';

function keyForUid(uid: string): string {
  return `${CACHE_KEY_PREFIX}${uid}`;
}

export async function readRepeatOrderCache(
  uid: string,
): Promise<RepeatOrderCachePayload | null> {
  try {
    const raw = await AsyncStorage.getItem(keyForUid(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RepeatOrderCachePayload;
    if (!parsed || parsed.uid !== uid) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeRepeatOrderCache(
  payload: RepeatOrderCachePayload,
): Promise<void> {
  try {
    await AsyncStorage.setItem(keyForUid(payload.uid), JSON.stringify(payload));
  } catch {
    /* best-effort cache */
  }
}

export async function clearRepeatOrderCache(uid: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyForUid(uid));
  } catch {
    /* ignore */
  }
}
