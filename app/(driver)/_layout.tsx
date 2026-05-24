import { DriverStackGate } from '@/components/driver/DriverStackGate';
import { RoleShellLayoutGuard } from '@/components/layout/RoleShellLayoutGuard';

export const unstable_settings = {
  initialRouteName: 'index',
};

/** Driver route group — role guard runs before any driver providers mount. */
export default function DriverLayout() {
  return (
    <RoleShellLayoutGuard shell="driver">
      <DriverStackGate />
    </RoleShellLayoutGuard>
  );
}
