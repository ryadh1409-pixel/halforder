import { Redirect } from 'expo-router';

/** Legacy `/driver/dashboard` → canonical driver hub stack at `app/(driver)/`. */
const DRIVER_HUB_HREF = '/(driver)' as const;

export default function LegacyDriverPath() {
  return <Redirect href={DRIVER_HUB_HREF} />;
}
