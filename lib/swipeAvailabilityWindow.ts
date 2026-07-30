/**
 * Display formatting for the existing admin availability window
 * (`availableFrom` / `availableUntil`). Presentation only — visibility and
 * expiry stay in `lib/adminFoodShareAvailability.ts`.
 */

export type SwipeAvailabilityWindow = {
  availableFromMs?: number | null;
  availableUntilMs?: number | null;
};

/**
 * How the window should read, so callers never have to inspect the copy:
 * `now` is open and closes today, `live` is open past today,
 * `ending-soon` is counting down, `scheduled` has not opened yet.
 */
export type SwipeAvailabilityTone = 'now' | 'live' | 'ending-soon' | 'scheduled';

export type SwipeAvailabilityDisplay = {
  /** Lead copy, e.g. `Available now` or `Available until tomorrow`. */
  title: string;
  /** Supporting time range, e.g. `11:00 AM – 3:00 PM`. */
  detail: string | null;
  tone: SwipeAvailabilityTone;
};

const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;
/** Below this remaining time a countdown reads better than a clock time. */
const RELATIVE_END_WINDOW_MS = 3 * 60 * MS_PER_MINUTE;

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function startOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Calendar days between two instants (0 = same day, 1 = next day). */
function calendarDayOffset(targetMs: number, nowMs: number): number {
  return Math.round((startOfDay(targetMs) - startOfDay(nowMs)) / MS_PER_DAY);
}

/** Rounds down so the countdown never over-promises time. */
function formatCountdown(remainingMs: number): string | null {
  if (remainingMs <= 0 || remainingMs > RELATIVE_END_WINDOW_MS) return null;
  const minutes = Math.floor(remainingMs / MS_PER_MINUTE);
  if (minutes < 1) return 'Ends in under a minute';
  if (minutes < 60) {
    return `Ends in ${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  const hours = Math.floor(minutes / 60);
  return `Ends in ${hours} hour${hours === 1 ? '' : 's'}`;
}

/**
 * Picks the friendliest wording for a card's availability window.
 * Returns null when the window carries nothing useful to show.
 */
export function formatSwipeAvailabilityWindow(
  window: SwipeAvailabilityWindow,
  nowMs = Date.now(),
): SwipeAvailabilityDisplay | null {
  const from = window.availableFromMs ?? null;
  const until = window.availableUntilMs ?? null;
  if (from == null && until == null) return null;

  // Not open yet — lead with the day it opens.
  if (from != null && from > nowMs) {
    const offset = calendarDayOffset(from, nowMs);
    const title =
      offset <= 0
        ? 'Available today'
        : offset === 1
          ? 'Available tomorrow'
          : `Available ${formatDay(from)}`;
    return {
      title,
      detail:
        until != null
          ? `${formatClock(from)} – ${formatClock(until)}`
          : `From ${formatClock(from)}`,
      tone: 'scheduled',
    };
  }

  if (until == null) return null;

  // Open now — a countdown is friendliest once the end is close.
  const countdown = formatCountdown(until - nowMs);
  if (countdown) return { title: countdown, detail: null, tone: 'ending-soon' };

  const offset = calendarDayOffset(until, nowMs);
  if (offset <= 0) {
    return {
      title: 'Available now',
      detail: `Until ${formatClock(until)}`,
      tone: 'now',
    };
  }
  if (offset === 1) {
    return {
      title: 'Available until tomorrow',
      detail: formatClock(until),
      tone: 'live',
    };
  }
  return {
    title: 'Available until',
    detail: `${formatDay(until)}, ${formatClock(until)}`,
    tone: 'live',
  };
}
