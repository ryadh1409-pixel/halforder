import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/**
 * React Native `fetch(file://)` / `fetch(content://)` is unreliable; read local
 * picker assets with expo-file-system, then build a Blob for the modular Storage SDK.
 */
export async function blobFromPickerUri(uri: string): Promise<Blob> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error('Could not read image');
    }
    return response.blob();
  }

  const useFileSystem =
    uri.startsWith('file://') ||
    uri.startsWith('content://') ||
    uri.startsWith('ph://') ||
    uri.startsWith('assets-library:');

  if (useFileSystem) {
    const base64 = await readAsStringAsync(uri, {
      encoding: EncodingType.Base64,
    });
    const response = await fetch(
      `data:application/octet-stream;base64,${base64}`,
    );
    return response.blob();
  }

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Could not read image');
  }
  return response.blob();
}
