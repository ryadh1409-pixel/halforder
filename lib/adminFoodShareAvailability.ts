export type AdminFoodShareAvailabilityStatus =
  | 'inactive'
  | 'scheduled'
  | 'live'
  | 'expired';

export type AdminFoodShareAvailability = {
  active: boolean;
  availableFromMs: number | null;
  availableUntilMs: number | null;
};

export function adminFoodShareAvailabilityStatus(
  availability: AdminFoodShareAvailability,
  nowMs = Date.now(),
): AdminFoodShareAvailabilityStatus {
  if (!availability.active) return 'inactive';
  if (
    availability.availableFromMs != null &&
    nowMs < availability.availableFromMs
  ) {
    return 'scheduled';
  }
  if (
    availability.availableUntilMs != null &&
    nowMs > availability.availableUntilMs
  ) {
    return 'expired';
  }
  return 'live';
}

export function isAdminFoodShareLive(
  availability: AdminFoodShareAvailability,
  nowMs = Date.now(),
): boolean {
  return adminFoodShareAvailabilityStatus(availability, nowMs) === 'live';
}

export function availabilityStatusLabel(
  status: AdminFoodShareAvailabilityStatus,
): string {
  switch (status) {
    case 'scheduled':
      return 'Scheduled';
    case 'live':
      return 'Live';
    case 'expired':
      return 'Expired';
    default:
      return 'Inactive';
  }
}

/** Delay until the next window boundary, with a small inclusive-boundary buffer. */
export function nextAvailabilityBoundaryDelay(
  rows: {
    availableFromMs: number | null;
    availableUntilMs: number | null;
  }[],
  nowMs = Date.now(),
): number | null {
  let next: number | null = null;
  for (const row of rows) {
    for (const boundary of [row.availableFromMs, row.availableUntilMs]) {
      if (boundary != null && boundary >= nowMs && (next == null || boundary < next)) {
        next = boundary;
      }
    }
  }
  return next == null ? null : Math.max(1, next - nowMs + 25);
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function availabilityDateInput(ms: number | null): string {
  if (ms == null) return '';
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate(),
  )}`;
}

export function availabilityTimeInput(ms: number | null): string {
  if (ms == null) return '';
  const date = new Date(ms);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function parseAvailabilityDateTime(
  dateInput: string,
  timeInput: string,
): number | null {
  const dateText = dateInput.trim();
  const timeText = timeInput.trim();
  if (!dateText && !timeText) return null;

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeText);
  if (!dateMatch || !timeMatch) {
    throw new Error('Use YYYY-MM-DD for dates and HH:MM for times.');
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const value = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    value.getFullYear() !== year ||
    value.getMonth() !== month - 1 ||
    value.getDate() !== day ||
    value.getHours() !== hour ||
    value.getMinutes() !== minute
  ) {
    throw new Error('Enter a valid availability date and time.');
  }
  return value.getTime();
}

export function formatAvailabilityDateTime(ms: number | null): string {
  if (ms == null) return 'Open-ended';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
