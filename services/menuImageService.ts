/**
 * Restaurant menu item & logo image uploads.
 * Storage path: `restaurants/{restaurantId}/menu/{itemId}.jpg` (see storage.rules).
 */
import * as ImagePicker from 'expo-image-picker';
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';

import { blobFromPickerUri } from '../lib/imageBlob';
import { getReadableErrorMessage } from '../utils/errorMessages';
import { ensureAuthReady, storage } from './firebase';

export type MenuImageUploadProgress = {
  bytesTransferred: number;
  totalBytes: number;
  /** 0–1 */
  progress: number;
};

export type UploadAbortHandle = {
  aborted: boolean;
};

const devLog =
  __DEV__
    ? (step: string, detail?: Record<string, unknown>) => {
        console.log('[menuImage]', step, detail ?? '');
      }
    : () => undefined;

export function menuItemImageStoragePath(
  restaurantId: string,
  itemId: string,
): string {
  return `restaurants/${restaurantId.trim()}/menu/${itemId.trim()}.jpg`;
}

export function restaurantLogoStoragePath(restaurantId: string): string {
  return `restaurants/${restaurantId.trim()}/logo.jpg`;
}

/** Decode Firebase Storage download URL → object path (for legacy cleanup). */
export function storagePathFromDownloadUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const objectMatch = parsed.pathname.match(/\/o\/(.+)$/);
    if (!objectMatch?.[1]) return null;
    return decodeURIComponent(objectMatch[1]);
  } catch {
    return null;
  }
}

export async function pickMenuImageFromLibrary(
  quality = 0.85,
): Promise<{ localUri: string } | { cancelled: true }> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Photo library permission denied');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [4, 3],
    quality,
  });

  if (result.canceled || !result.assets[0]?.uri) {
    return { cancelled: true };
  }

  return { localUri: result.assets[0].uri };
}

export async function uploadMenuItemImage(params: {
  restaurantId: string;
  itemId: string;
  localUri: string;
  onProgress?: (progress: MenuImageUploadProgress) => void;
  abort?: UploadAbortHandle;
}): Promise<string> {
  const restaurantId = params.restaurantId.trim();
  const itemId = params.itemId.trim();
  const localUri = params.localUri.trim();
  if (!restaurantId || !itemId || !localUri) {
    throw new Error('Missing upload parameters');
  }

  await ensureAuthReady();
  const blob = await blobFromPickerUri(localUri);
  const path = menuItemImageStoragePath(restaurantId, itemId);
  const storageRef = ref(storage, path);
  const contentType =
    blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';

  devLog('upload started', { path });

  const task = uploadBytesResumable(storageRef, blob, { contentType });

  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
        if (params.abort?.aborted) return;
        const totalBytes = snapshot.totalBytes;
        const bytesTransferred = snapshot.bytesTransferred;
        params.onProgress?.({
          bytesTransferred,
          totalBytes,
          progress: totalBytes > 0 ? bytesTransferred / totalBytes : 0,
        });
      },
      (error) => reject(error),
      () => resolve(),
    );
  });

  if (params.abort?.aborted) {
    throw new Error('Upload cancelled');
  }

  const downloadUrl = await getDownloadURL(storageRef);
  devLog('upload success', { path, downloadUrl });
  return downloadUrl;
}

export async function uploadRestaurantLogo(params: {
  restaurantId: string;
  localUri: string;
  onProgress?: (progress: MenuImageUploadProgress) => void;
  abort?: UploadAbortHandle;
}): Promise<string> {
  const restaurantId = params.restaurantId.trim();
  const localUri = params.localUri.trim();
  if (!restaurantId || !localUri) {
    throw new Error('Missing upload parameters');
  }

  await ensureAuthReady();
  const blob = await blobFromPickerUri(localUri);
  const path = restaurantLogoStoragePath(restaurantId);
  const storageRef = ref(storage, path);
  const contentType =
    blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';

  devLog('logo upload started', { path });

  const task = uploadBytesResumable(storageRef, blob, { contentType });

  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
        if (params.abort?.aborted) return;
        const totalBytes = snapshot.totalBytes;
        const bytesTransferred = snapshot.bytesTransferred;
        params.onProgress?.({
          bytesTransferred,
          totalBytes,
          progress: totalBytes > 0 ? bytesTransferred / totalBytes : 0,
        });
      },
      (error) => reject(error),
      () => resolve(),
    );
  });

  if (params.abort?.aborted) {
    throw new Error('Upload cancelled');
  }

  const downloadUrl = await getDownloadURL(storageRef);
  devLog('logo upload success', { path, downloadUrl });
  return downloadUrl;
}

export async function deleteStorageObjectAtPath(path: string): Promise<void> {
  const trimmed = path.trim();
  if (!trimmed) return;
  try {
    await deleteObject(ref(storage, trimmed));
    devLog('old image deleted', { path: trimmed });
  } catch (error) {
    devLog('old image delete skipped', {
      path: trimmed,
      reason: getReadableErrorMessage(error, 'upload'),
    });
  }
}

/**
 * Remove a previous menu image only when it lived at a non-canonical legacy path.
 * Canonical `restaurants/{id}/menu/{itemId}.jpg` is overwritten in place.
 */
export async function deleteLegacyMenuItemImage(params: {
  restaurantId: string;
  itemId: string;
  previousImageUrl: string | null | undefined;
}): Promise<void> {
  const previous = params.previousImageUrl?.trim();
  if (!previous) return;

  const canonical = menuItemImageStoragePath(params.restaurantId, params.itemId);
  const previousPath = storagePathFromDownloadUrl(previous);
  if (!previousPath || previousPath === canonical) return;

  await deleteStorageObjectAtPath(previousPath);
}
