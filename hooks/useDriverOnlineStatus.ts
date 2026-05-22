import { useDriverPresence } from '@/hooks/useDriverPresence';

type UseDriverOnlineStatusOptions = {
  enabled?: boolean;
  displayName?: string | null;
};

/**
 * Thin alias for screens that only need online status + toggle (e.g. Orders tab).
 */
export function useDriverOnlineStatus(
  driverId: string | null | undefined,
  options: UseDriverOnlineStatusOptions = {},
) {
  const { isOnline, loading, toggling, setOnlineStatus } = useDriverPresence(driverId, options);
  return {
    online: isOnline,
    loading,
    toggling,
    setOnlineStatus,
  };
}
