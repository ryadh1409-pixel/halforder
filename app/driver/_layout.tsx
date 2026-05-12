import { Stack } from 'expo-router';

const DRIVER_LEGACY_STACK_SCREEN_OPTIONS = {
  headerShown: false,
  animation: 'slide_from_right',
} as const;

export default function DriverLegacyLayout() {
  return <Stack screenOptions={DRIVER_LEGACY_STACK_SCREEN_OPTIONS} />;
}
