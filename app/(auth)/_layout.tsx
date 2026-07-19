import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="password" />
      <Stack.Screen name="account-not-found" />
      <Stack.Screen name="register" />
      <Stack.Screen name="location-permission" />
      <Stack.Screen name="phone" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}
