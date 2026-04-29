import { subscribeDrivers, type DriverProfile } from '@/services/driverService';
import { useEffect, useState } from 'react';

export function useDrivers() {
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeDrivers((rows) => {
      setDrivers(rows);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { drivers, loading };
}
