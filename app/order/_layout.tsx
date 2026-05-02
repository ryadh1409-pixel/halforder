import { Stack } from 'expo-router';

export default function OrderLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="create" />
      <Stack.Screen name="join" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="room/[id]" />
      <Stack.Screen name="success" />
      <Stack.Screen name="checkout" />
      <Stack.Screen name="payment-callback" />
    </Stack>
  );
}
