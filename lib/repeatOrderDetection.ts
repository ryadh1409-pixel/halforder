import type {
  RepeatHabitKind,
  RepeatOrderCandidate,
  RepeatOrderHistoryEntry,
  RepeatOrderItemSnapshot,
  RepeatOrderSchedulePlan,
} from '@/types/repeatOrder';

/** Minimum completed orders of the same pattern before we recommend. */
export const REPEAT_ORDER_MIN_FREQUENCY = 2;

/** How many recent completed orders to consider. */
export const REPEAT_ORDER_HISTORY_LIMIT = 40;

/** Local cache TTL — still refreshed on Home focus / after new completions. */
export const REPEAT_ORDER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Hide habits not ordered within this many days. */
export const REPEAT_ORDER_MAX_AGE_DAYS = 45;

/** Minimum confidence (0–1) to show card or notify. */
export const REPEAT_ORDER_MIN_CONFIDENCE = 0.42;

/**
 * Home card lead window: show when usual time is this many minutes away
 * (0 = at usual time, 60 = an hour before).
 */
export const REPEAT_ORDER_CARD_LEAD_MAX_MIN = 60;
export const REPEAT_ORDER_CARD_LEAD_MIN_MIN = 0;

/** Notify lead window before usual order time (minutes). */
export const REPEAT_ORDER_NOTIFY_LEAD_MIN = 30;
export const REPEAT_ORDER_NOTIFY_LEAD_MAX = 60;

/**
 * Deterministic lead minutes in [30, 60] for a habit+day — stable across resyncs
 * so the same scheduled fire time is reused (no duplicate jitter).
 */
export function pickRepeatNotifyLeadMinutes(
  habitKey: string,
  dayKey: string,
): number {
  const raw = `${habitKey}|${dayKey}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  const span =
    REPEAT_ORDER_NOTIFY_LEAD_MAX - REPEAT_ORDER_NOTIFY_LEAD_MIN + 1;
  return REPEAT_ORDER_NOTIFY_LEAD_MIN + (hash % span);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export function minutesOfDayFromMs(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

export function buildRepeatItemSignature(
  items: RepeatOrderItemSnapshot[],
): string {
  const ids = items
    .map((i) => (typeof i.id === 'string' ? i.id.trim() : ''))
    .filter(Boolean)
    .sort();
  return ids.join('|');
}

export function summarizeRepeatItems(
  items: RepeatOrderItemSnapshot[],
): string {
  if (items.length === 0) return 'Previous order';
  const parts = items.slice(0, 3).map((i) => {
    const qty = i.qty > 1 ? `${i.qty}× ` : '';
    return `${qty}${i.name}`.trim();
  });
  const extra = items.length > 3 ? ` +${items.length - 3} more` : '';
  return `${parts.join(', ')}${extra}`;
}

export function makeRepeatHabitKey(
  restaurantId: string,
  itemSignature: string,
): string {
  const sig = itemSignature.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
  return `${restaurantId}_${sig || 'items'}`;
}

function mealBucket(minutes: number): 'lunch' | 'dinner' | 'late_night' | 'other' {
  const h = Math.floor(minutes / 60);
  if (h >= 11 && h < 15) return 'lunch';
  if (h >= 17 && h < 21) return 'dinner';
  if (h >= 21 || h < 5) return 'late_night';
  return 'other';
}

function classifyHabitKind(
  weekdays: number[],
  usualMinutes: number,
  frequency: number,
): RepeatHabitKind {
  const weekendHits = weekdays.filter((d) => d === 0 || d === 6).length;
  const weekdayHits = weekdays.length - weekendHits;
  const uniqueDays = new Set(weekdays).size;
  const meal = mealBucket(usualMinutes);

  if (weekendHits >= 2 && weekendHits >= weekdayHits) return 'weekend';
  if (frequency >= 4 && uniqueDays >= 4) return 'daily';
  if (uniqueDays <= 2 && frequency >= 2) return 'weekly';
  if (meal === 'lunch') return 'lunch';
  if (meal === 'dinner') return 'dinner';
  if (meal === 'late_night') return 'late_night';
  return frequency >= 3 ? 'daily' : 'weekly';
}

function computeConfidence(
  frequency: number,
  weekdays: number[],
  minutes: number[],
): number {
  const uniqueDays = new Set(weekdays).size;
  const freqScore = Math.min(1, frequency / 5);
  const dayConsistency =
    uniqueDays <= 1 ? 1 : uniqueDays === 2 ? 0.75 : uniqueDays <= 4 ? 0.55 : 0.4;
  let timeConsistency = 0.5;
  if (minutes.length >= 2) {
    const center = median(minutes);
    const spreads = minutes.map((m) => {
      const d = Math.abs(m - center);
      return Math.min(d, 24 * 60 - d);
    });
    const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    timeConsistency = avgSpread <= 45 ? 1 : avgSpread <= 90 ? 0.7 : 0.4;
  }
  return Math.max(
    0,
    Math.min(1, freqScore * 0.45 + dayConsistency * 0.3 + timeConsistency * 0.25),
  );
}

/**
 * Group completed history into restaurant + item-signature habits.
 */
export function buildRepeatOrderCandidates(
  history: RepeatOrderHistoryEntry[],
  nowMs = Date.now(),
): RepeatOrderCandidate[] {
  const map = new Map<
    string,
    {
      restaurantId: string;
      restaurantName: string;
      itemSignature: string;
      entries: RepeatOrderHistoryEntry[];
    }
  >();

  for (const entry of history) {
    if (!entry.restaurantId || !entry.itemSignature || entry.items.length === 0) {
      continue;
    }
    const key = `${entry.restaurantId}::${entry.itemSignature}`;
    const existing = map.get(key);
    if (existing) {
      existing.entries.push(entry);
      if (entry.orderedAtMs >= (existing.entries[0]?.orderedAtMs ?? 0)) {
        existing.restaurantName = entry.restaurantName || existing.restaurantName;
      }
    } else {
      map.set(key, {
        restaurantId: entry.restaurantId,
        restaurantName: entry.restaurantName,
        itemSignature: entry.itemSignature,
        entries: [entry],
      });
    }
  }

  const maxAgeMs = REPEAT_ORDER_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const candidates: RepeatOrderCandidate[] = [];

  for (const group of map.values()) {
    if (group.entries.length < REPEAT_ORDER_MIN_FREQUENCY) continue;
    const sorted = [...group.entries].sort(
      (a, b) => b.orderedAtMs - a.orderedAtMs,
    );
    const latest = sorted[0]!;
    if (nowMs - latest.orderedAtMs > maxAgeMs) continue;

    const weekdays = sorted.map((e) => new Date(e.orderedAtMs).getDay());
    const minutes = sorted.map((e) => minutesOfDayFromMs(e.orderedAtMs));
    const usualMinutesOfDay = Math.round(median(minutes));
    const frequency = sorted.length;
    const confidence = computeConfidence(frequency, weekdays, minutes);
    if (confidence < REPEAT_ORDER_MIN_CONFIDENCE) continue;

    const habitKind = classifyHabitKind(
      weekdays,
      usualMinutesOfDay,
      frequency,
    );

    candidates.push({
      restaurantId: group.restaurantId,
      restaurantName: group.restaurantName || 'Restaurant',
      itemSignature: group.itemSignature,
      habitKey: makeRepeatHabitKey(group.restaurantId, group.itemSignature),
      sourceOrderId: latest.orderId,
      items: latest.items,
      totalPrice: latest.totalPrice,
      lastOrderedAtMs: latest.orderedAtMs,
      estimatedDeliveryMinutes: latest.estimatedDeliveryMinutes,
      frequency,
      weekdays,
      minutesOfDay: minutes,
      usualMinutesOfDay,
      habitKind,
      confidence,
    });
  }
  return candidates;
}

export type RepeatScoreContext = {
  nowMs?: number;
  /** When true, heavily weight current day/time relevance (Home card). */
  requireLeadWindow?: boolean;
};

function circularMinuteDelta(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 24 * 60 - d);
}

/**
 * Minutes until the next occurrence of `usualMinutes` on an allowed weekday.
 * 0 when we are at/after usual today and still within a small grace, else
 * minutes until next matching day/time.
 */
export function minutesUntilNextUsual(input: {
  usualMinutesOfDay: number;
  weekdays: number[];
  nowMs?: number;
  /** Grace after usual time still counts as "now" for the Home card. */
  postGraceMin?: number;
}): { minutesUntil: number; nextAtMs: number; dayKey: string } {
  const nowMs = input.nowMs ?? Date.now();
  const now = new Date(nowMs);
  const postGrace = input.postGraceMin ?? 20;
  const allowed =
    input.weekdays.length > 0
      ? new Set(input.weekdays)
      : new Set([0, 1, 2, 3, 4, 5, 6]);

  for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
    const day = new Date(now);
    day.setDate(now.getDate() + dayOffset);
    day.setSeconds(0, 0);
    const dow = day.getDay();
    if (!allowed.has(dow)) continue;

    const target = new Date(day);
    target.setHours(
      Math.floor(input.usualMinutesOfDay / 60),
      input.usualMinutesOfDay % 60,
      0,
      0,
    );
    const targetMs = target.getTime();
    const deltaMin = (targetMs - nowMs) / 60000;

    if (dayOffset === 0) {
      if (deltaMin >= -postGrace && deltaMin <= REPEAT_ORDER_CARD_LEAD_MAX_MIN) {
        const dayKey = formatLocalDayKey(targetMs);
        return {
          minutesUntil: Math.max(0, deltaMin),
          nextAtMs: targetMs,
          dayKey,
        };
      }
      if (deltaMin < -postGrace) continue;
    }

    if (deltaMin > 0) {
      return {
        minutesUntil: deltaMin,
        nextAtMs: targetMs,
        dayKey: formatLocalDayKey(targetMs),
      };
    }
  }

  // Fallback: tomorrow at usual time
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(
    Math.floor(input.usualMinutesOfDay / 60),
    input.usualMinutesOfDay % 60,
    0,
    0,
  );
  return {
    minutesUntil: (tomorrow.getTime() - nowMs) / 60000,
    nextAtMs: tomorrow.getTime(),
    dayKey: formatLocalDayKey(tomorrow.getTime()),
  };
}

export function formatLocalDayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isInRepeatCardLeadWindow(minutesUntilUsual: number): boolean {
  return (
    minutesUntilUsual >= REPEAT_ORDER_CARD_LEAD_MIN_MIN &&
    minutesUntilUsual <= REPEAT_ORDER_CARD_LEAD_MAX_MIN
  );
}

/**
 * Score a candidate. Higher = better.
 * Weights: day/time relevance, frequency, recency, consistency (confidence).
 */
export function scoreRepeatOrderCandidate(
  candidate: RepeatOrderCandidate,
  ctx: RepeatScoreContext = {},
): number {
  const now = ctx.nowMs ?? Date.now();
  const { minutesUntil, nextAtMs } = minutesUntilNextUsual({
    usualMinutesOfDay: candidate.usualMinutesOfDay,
    weekdays: candidate.weekdays,
    nowMs: now,
  });

  let score = 0;

  // Frequency
  score += candidate.frequency * 26;

  // Consistency / confidence
  score += candidate.confidence * 40;

  // Recency (decay ~45 days)
  const ageDays = Math.max(
    0,
    (now - candidate.lastOrderedAtMs) / (24 * 60 * 60 * 1000),
  );
  score += Math.max(0, 32 - ageDays * 0.7);

  // Current day/time relevance
  const inWindow = isInRepeatCardLeadWindow(minutesUntil);
  if (inWindow) {
    score += 55 + (1 - minutesUntil / REPEAT_ORDER_CARD_LEAD_MAX_MIN) * 20;
  } else if (minutesUntil <= 180) {
    score += 18;
  }

  // Same weekday boost from history
  const weekday = new Date(nextAtMs).getDay();
  const weekdayHits = candidate.weekdays.filter((d) => d === weekday).length;
  if (weekdayHits > 0) score += 20 + weekdayHits * 5;

  // Time-of-day alignment
  const nowMinutes = minutesOfDayFromMs(now);
  const timeDelta = circularMinuteDelta(nowMinutes, candidate.usualMinutesOfDay);
  if (timeDelta <= 90) {
    score += 24 * (1 - timeDelta / 90);
  }

  if (ctx.requireLeadWindow && !inWindow) {
    return -1;
  }

  return score;
}

/** Best candidate for Home card (must be in lead window). */
export function pickBestRepeatOrderCandidate(
  candidates: RepeatOrderCandidate[],
  ctx: RepeatScoreContext = {},
): { candidate: RepeatOrderCandidate; score: number; minutesUntil: number } | null {
  if (candidates.length === 0) return null;
  let best: {
    candidate: RepeatOrderCandidate;
    score: number;
    minutesUntil: number;
  } | null = null;

  for (const candidate of candidates) {
    const score = scoreRepeatOrderCandidate(candidate, {
      ...ctx,
      requireLeadWindow: ctx.requireLeadWindow ?? true,
    });
    if (score < 0) continue;
    const { minutesUntil } = minutesUntilNextUsual({
      usualMinutesOfDay: candidate.usualMinutesOfDay,
      weekdays: candidate.weekdays,
      nowMs: ctx.nowMs,
    });
    if (!best || score > best.score) {
      best = { candidate, score, minutesUntil };
    }
  }
  return best;
}

/**
 * Compute when to fire a habit notification for the next usual time.
 * Lead is deterministic in 30–60 minutes; if the user is already inside that
 * window and has not been notified, fire shortly (still before usual).
 */
export function computeRepeatNotificationFireAt(input: {
  usualMinutesOfDay: number;
  weekdays: number[];
  habitKey: string;
  nowMs?: number;
}): { fireAtMs: number; nextAtMs: number; dayKey: string } | null {
  const now = input.nowMs ?? Date.now();
  const { nextAtMs, dayKey, minutesUntil } = minutesUntilNextUsual({
    usualMinutesOfDay: input.usualMinutesOfDay,
    weekdays: input.weekdays,
    nowMs: now,
    postGraceMin: 0,
  });

  if (nextAtMs <= now) return null;

  const leadMin = pickRepeatNotifyLeadMinutes(input.habitKey, dayKey);
  let fireAtMs = nextAtMs - leadMin * 60 * 1000;

  // Already inside the 30–60 min notify window → ping soon (still before usual).
  if (fireAtMs <= now) {
    if (
      minutesUntil >= REPEAT_ORDER_NOTIFY_LEAD_MIN &&
      minutesUntil <= REPEAT_ORDER_NOTIFY_LEAD_MAX
    ) {
      fireAtMs = now + 25_000;
    } else {
      return null;
    }
  }

  if (fireAtMs >= nextAtMs) return null;
  if (fireAtMs - now > 48 * 60 * 60 * 1000) return null;

  return { fireAtMs, nextAtMs, dayKey };
}

/** Build notification schedule plans for upcoming habits (one per habit max). */
export function buildRepeatOrderSchedulePlans(
  candidates: RepeatOrderCandidate[],
  extras: {
    nowMs?: number;
    offerByRestaurant?: Record<string, boolean>;
    shareByRestaurant?: Record<string, boolean>;
    /** Skip closed / ineligible restaurants when provided. */
    eligibleByRestaurant?: Record<string, boolean>;
  } = {},
): RepeatOrderSchedulePlan[] {
  const now = extras.nowMs ?? Date.now();
  const plans: RepeatOrderSchedulePlan[] = [];

  for (const candidate of candidates) {
    if (candidate.confidence < REPEAT_ORDER_MIN_CONFIDENCE) continue;
    if (
      extras.eligibleByRestaurant &&
      extras.eligibleByRestaurant[candidate.restaurantId] !== true
    ) {
      continue;
    }

    const fire = computeRepeatNotificationFireAt({
      usualMinutesOfDay: candidate.usualMinutesOfDay,
      weekdays: candidate.weekdays,
      habitKey: candidate.habitKey,
      nowMs: now,
    });
    if (!fire) continue;

    plans.push({
      habitKey: candidate.habitKey,
      restaurantId: candidate.restaurantId,
      restaurantName: candidate.restaurantName,
      itemSignature: candidate.itemSignature,
      habitKind: candidate.habitKind,
      fireAtMs: fire.fireAtMs,
      dayKey: fire.dayKey,
      hasAvailableOffer:
        extras.offerByRestaurant?.[candidate.restaurantId] === true,
      hasShareAndSave:
        extras.shareByRestaurant?.[candidate.restaurantId] === true,
      usualMinutesOfDay: candidate.usualMinutesOfDay,
    });
  }

  // Soonest first; keep a small set to limit OS schedules.
  plans.sort((a, b) => a.fireAtMs - b.fireAtMs);
  return plans.slice(0, 4);
}

export function userAlreadyOrderedHabitToday(input: {
  history: RepeatOrderHistoryEntry[];
  restaurantId: string;
  itemSignature: string;
  nowMs?: number;
}): boolean {
  const now = input.nowMs ?? Date.now();
  const dayKey = formatLocalDayKey(now);
  return input.history.some((h) => {
    if (h.restaurantId !== input.restaurantId) return false;
    if (h.itemSignature !== input.itemSignature) return false;
    return formatLocalDayKey(h.orderedAtMs) === dayKey;
  });
}

export function formatRepeatLastOrdered(ms: number, nowMs = Date.now()): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'Recently';
  const dayMs = 24 * 60 * 60 * 1000;
  const startToday = new Date(nowMs);
  startToday.setHours(0, 0, 0, 0);
  const startOrder = new Date(ms);
  startOrder.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (startToday.getTime() - startOrder.getTime()) / dayMs,
  );
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Recently';
  }
}

export function formatRepeatMoney(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return '—';
  return `$${amount.toFixed(2)}`;
}

export function formatRepeatEtaMinutes(minutes: number): string {
  const m =
    Number.isFinite(minutes) && minutes > 0 && minutes < 180
      ? Math.round(minutes)
      : 35;
  return `${m}–${m + 10} min`;
}

export function reconcileRepeatItemsWithMenu(
  prior: RepeatOrderItemSnapshot[],
  menuById: Map<
    string,
    { id: string; name: string; price: number; image: string | null; available: boolean }
  >,
): RepeatOrderItemSnapshot[] {
  const out: RepeatOrderItemSnapshot[] = [];
  for (const line of prior) {
    const id = line.id.trim();
    if (!id) continue;
    const live = menuById.get(id);
    if (!live || live.available === false) continue;
    out.push({
      id: live.id,
      name: live.name || line.name,
      price:
        typeof live.price === 'number' && Number.isFinite(live.price)
          ? live.price
          : line.price,
      qty: Math.max(1, Math.floor(line.qty) || 1),
      image: live.image ?? line.image,
    });
  }
  return out;
}

export function historyFingerprint(orderIds: string[]): string {
  return [...orderIds].sort().join(',');
}

export function pickRepeatNotificationCopy(plan: RepeatOrderSchedulePlan): {
  title: string;
  body: string;
} {
  if (plan.hasAvailableOffer) {
    return {
      title: '🎉 Your favorite restaurant has an available offer today.',
      body: `${plan.restaurantName} — reorder your usual in one tap.`,
    };
  }
  if (plan.hasShareAndSave) {
    return {
      title: '🤝 Share & Save is available for your usual restaurant.',
      body: `Share & Save is available for ${plan.restaurantName}.`,
    };
  }
  switch (plan.habitKind) {
    case 'dinner':
      return {
        title: "🍕 It's almost dinner time. Reorder your favorite meal in one tap.",
        body: `Your usual from ${plan.restaurantName} is waiting.`,
      };
    case 'late_night':
      return {
        title: '🌮 Hungry? Your usual order is ready whenever you are.',
        body: `Reorder from ${plan.restaurantName} in one tap.`,
      };
    case 'lunch':
      return {
        title: '🍔 Ready for your usual? Your favorite order is waiting.',
        body: `Lunch from ${plan.restaurantName} — reorder in one tap.`,
      };
    case 'weekend':
      return {
        title: '🍔 Ready for your usual? Your favorite order is waiting.',
        body: `Your weekend usual from ${plan.restaurantName} is ready.`,
      };
    case 'daily':
      return {
        title: '🍔 Ready for your usual? Your favorite order is waiting.',
        body: `Your favorite order from ${plan.restaurantName} is waiting.`,
      };
    default:
      return {
        title: '🍔 Ready for your usual? Your favorite order is waiting.',
        body: `Your usual from ${plan.restaurantName} is ready whenever you are.`,
      };
  }
}
