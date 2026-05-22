import { useDriverPresenceContext } from '@/contexts/DriverPresenceContext';

/**
 * Driver online status from the shared DriverPresenceProvider (Orders tab, etc.).
 */
export function useDriverOnlineStatus() {
  const { isOnline, loading, toggling, setOnlineStatus } = useDriverPresenceContext();
  return {
    online: isOnline,
    loading,
    toggling,
    setOnlineStatus,
  };
}
