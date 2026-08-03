import { subscribeDriverActiveOrders, type ActiveDelivery } from '@/services/delivery';
import { useAuthUid } from '@/hooks/useAuthUid';
import { logListenerSubscribe, logListenerUnsubscribe } from '@/utils/driverListenerLog';
import React, {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type DriverActiveOrdersValue = {
  driverId: string;
  orders: ActiveDelivery[];
  loading: boolean;
  error: string | null;
};

const DriverActiveOrdersContext = createContext<DriverActiveOrdersValue | null>(null);

/**
 * Single shell-level subscription for driver active orders.
 * Hub, Active, Dashboard, and Live Sharing consume this — never open a second list listener.
 */
function DriverActiveOrdersProviderInner({
  children,
  uid: uidProp,
}: {
  children: ReactNode;
  uid?: string;
}) {
  const authUid = useAuthUid();
  const driverId = (uidProp ?? authUid).trim();
  const [orders, setOrders] = useState<ActiveDelivery[]>([]);
  const [loading, setLoading] = useState(() => Boolean(driverId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!driverId) {
      setOrders([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const listenerName = 'driver.activeOrders';
    logListenerSubscribe(listenerName, driverId);
    setLoading(true);
    setError(null);

    const unsub = subscribeDriverActiveOrders(driverId, (rows) => {
      setOrders(Array.isArray(rows) ? rows : []);
      setLoading(false);
      setError(null);
    });

    return () => {
      logListenerUnsubscribe(listenerName, driverId);
      unsub();
    };
  }, [driverId]);

  const value = useMemo(
    (): DriverActiveOrdersValue => ({
      driverId,
      orders,
      loading,
      error,
    }),
    [driverId, orders, loading, error],
  );

  return (
    <DriverActiveOrdersContext.Provider value={value}>
      {children}
    </DriverActiveOrdersContext.Provider>
  );
}

export const DriverActiveOrdersProvider = memo(DriverActiveOrdersProviderInner);

/** Shared active-orders feed. Throws if used outside the driver shell provider. */
export function useDriverActiveOrdersFeed(): DriverActiveOrdersValue {
  const ctx = useContext(DriverActiveOrdersContext);
  if (!ctx) {
    throw new Error('useDriverActiveOrdersFeed must be used within DriverActiveOrdersProvider');
  }
  return ctx;
}

/** Optional access for screens that may render outside the provider. */
export function useOptionalDriverActiveOrdersFeed(): DriverActiveOrdersValue | null {
  return useContext(DriverActiveOrdersContext);
}
