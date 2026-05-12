import { Stack } from 'expo-router';

const DRIVER_STACK_SCREEN_OPTIONS = { headerShown: false, animation: 'slide_from_right' } as const;

export default function DriverLayout() {
  return <Stack screenOptions={DRIVER_STACK_SCREEN_OPTIONS} />;
}
