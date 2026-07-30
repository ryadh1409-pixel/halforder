/**
 * Display formatting for the existing admin availability window
 * (`availableFrom` / `availableUntil`). Presentation only — visibility and
 * expiry stay in `lib/adminFoodShareAvailability.ts`.
 */

export type SwipeAvailabilityWindow = {
  availableFromMs?: number | null;
  availableUntilMs?: number | null;
};

export type SwipeAvailabilityDisplay = {
  /** Lead copy, e.g. `Today` or `Available until 3:00 PM`. */
  title: string;
  /** Supporting time range, e.g. `11:00 AM – 3:00 PM`. */
  detail: string | null;
};

const MS_PER_DAY = 86_400_000;

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
      offset <= 0 ? 'Today' : offset === 1 ? 'Tomorrow' : formatDay(from);
    return {
      title,
      detail:
        until != null
          ? `${formatClock(from)} – ${formatClock(until)}`
          : `From ${formatClock(from)}`,
    };
  }

  if (until == null) return null;

  // Open now — lead with when it closes.
  const offset = calendarDayOffset(until, nowMs);
  if (offset <= 0) {
    return from != null
      ? { title: 'Today', detail: `${formatClock(from)} – ${formatClock(until)}` }
      : { title: `Available until ${formatClock(until)}`, detail: null };
  }
  if (offset === 1) {
    return { title: 'Available until tomorrow', detail: formatClock(until) };
  }
  return {
    title: 'Available until',
    detail: `${formatDay(until)}, ${formatClock(until)}`,
  };
}
