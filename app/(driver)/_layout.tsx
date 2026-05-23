import { DriverStackGate } from '@/components/driver/DriverStackGate';

export const unstable_settings = {
  initialRouteName: 'index',
};

/** Driver route group — providers gated inside DriverStackGate. */
export default function DriverLayout() {
  return <DriverStackGate />;
}
