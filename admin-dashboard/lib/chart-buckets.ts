import { dayKeyUtc } from '@/lib/dates';

export function lastNDayKeys(n: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const ms = d.getTime();
    keys.push(dayKeyUtc(ms));
  }
  return keys;
}

export function bucketCountsByDay(
  msList: number[],
  days: number,
): { day: string; count: number }[] {
  const keys = lastNDayKeys(days);
  const map = new Map<string, number>();
  keys.forEach((k) => map.set(k, 0));
  for (const ms of msList) {
    const k = dayKeyUtc(ms);
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return keys.map((day) => ({ day, count: map.get(day) ?? 0 }));
}
