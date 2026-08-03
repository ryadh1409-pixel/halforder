/** Shared display initials for courier avatars — presentation only. */
export function driverDisplayInitials(name: string | null | undefined): string {
  const n = (name ?? '').trim();
  if (!n) return 'D';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}
