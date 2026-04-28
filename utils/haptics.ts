import * as Haptics from 'expo-haptics';

export function successHaptic(): void {
  void Haptics.notificationAsync(
    Haptics.NotificationFeedbackType.Success,
  ).catch(() => {});
}

export function errorHaptic(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
    () => {},
  );
}
