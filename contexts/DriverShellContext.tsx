import { useDriverMountLog } from '@/utils/driverMountLog';
import { memo, type ReactNode } from 'react';

type DriverShellProviderProps = { children: ReactNode };

function DriverShellProviderInner({ children }: DriverShellProviderProps) {
  useDriverMountLog('DriverShellProvider');
  return children;
}

export const DriverShellProvider = memo(DriverShellProviderInner);
