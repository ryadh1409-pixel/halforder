import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'halforder_demo_mode_v1';

export async function setDemoModeEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, enabled ? '1' : '0');
}

export async function isDemoModeEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw === '1';
}
