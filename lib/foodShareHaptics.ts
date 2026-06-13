import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

async function safeHaptic(fn: () => Promise<void>): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await fn();
  } catch {
    // Haptics unavailable on some devices/simulators.
  }
}

export function hapticMatchFound(): void {
  void safeHaptic(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  );
}

export function hapticNewMessage(): void {
  void safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function hapticOrderStatusChange(): void {
  void safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export function hapticShareJoined(): void {
  void safeHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}
