export function formatRestaurantName(name: unknown): string {
  if (typeof name !== 'string') return 'Unknown restaurant';
  const trimmed = name.trim();
  return trimmed.length ? trimmed : 'Unknown restaurant';
}

export function formatAddress(address: unknown): string {
  if (typeof address !== 'string') return 'Address unavailable';
  const trimmed = address.trim();
  return trimmed.length ? trimmed : 'Address unavailable';
}

export function formatETA(minutes: unknown): string | null {
  const n = typeof minutes === 'number' ? minutes : Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `ETA ~${Math.round(n)} min`;
}

export function formatOrderStatus(status: unknown): string {
  if (typeof status !== 'string') return 'In progress';
  const normalized = status.trim().toLowerCase();
  if (!normalized) return 'In progress';
  return normalized
    .split('_')
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : s))
    .join(' ');
}
