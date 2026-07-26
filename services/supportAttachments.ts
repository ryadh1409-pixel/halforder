/**
 * Support evidence uploads → Firebase Storage `uploads/{uid}/support/...`
 */
import * as ImagePicker from 'expo-image-picker';
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';

import { blobFromPickerUri } from '@/lib/imageBlob';
import type { SupportAttachmentMeta } from '@/types/supportIntake';
import { ImagePickerPermissionError } from '@/services/imagePicker';
import { ensureAuthReady, storage } from '@/services/firebase';
import { getReadableErrorMessage } from '@/utils/errorMessages';

export type SupportUploadProgress = {
  bytesTransferred: number;
  totalBytes: number;
  /** 0–1 */
  progress: number;
};

const MAX_SUPPORT_IMAGES = 8;
const PICK_QUALITY = 0.55;

export function supportAttachmentStoragePath(
  userId: string,
  conversationId: string,
  fileId: string,
): string {
  return `uploads/${userId.trim()}/support/${conversationId.trim()}/${fileId}.jpg`;
}

export async function pickSupportImagesFromLibrary(
  maxCount = MAX_SUPPORT_IMAGES,
): Promise<string[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== 'granted' || !perm.granted) {
    throw new ImagePickerPermissionError(
      'Please enable photo access in Settings.',
      'library',
    );
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    allowsMultipleSelection: true,
    selectionLimit: Math.max(1, Math.min(maxCount, MAX_SUPPORT_IMAGES)),
    quality: PICK_QUALITY,
  });

  if (result.canceled || !result.assets?.length) return [];
  return result.assets
    .map((a) => a.uri)
    .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0)
    .slice(0, maxCount);
}

export async function takeSupportPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (perm.status !== 'granted' || !perm.granted) {
    throw new ImagePickerPermissionError(
      'Please enable camera access in Settings.',
      'camera',
    );
  }

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: false,
    quality: PICK_QUALITY,
  });

  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return result.assets[0].uri;
}

export async function uploadSupportAttachment(params: {
  userId: string;
  conversationId: string;
  localUri: string;
  onProgress?: (progress: SupportUploadProgress) => void;
}): Promise<SupportAttachmentMeta> {
  const userId = params.userId.trim();
  const conversationId = params.conversationId.trim();
  const localUri = params.localUri.trim();
  if (!userId || !conversationId || !localUri) {
    throw new Error('Missing upload parameters');
  }

  await ensureAuthReady();
  const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const path = supportAttachmentStoragePath(userId, conversationId, fileId);
  const blob = await blobFromPickerUri(localUri);
  const contentType =
    blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, blob, { contentType });

  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snapshot) => {
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

  const url = await getDownloadURL(storageRef);
  return { url, path, contentType };
}

export async function uploadSupportAttachments(params: {
  userId: string;
  conversationId: string;
  localUris: string[];
  onItemProgress?: (index: number, progress: SupportUploadProgress) => void;
}): Promise<SupportAttachmentMeta[]> {
  const results: SupportAttachmentMeta[] = [];
  for (let i = 0; i < params.localUris.length; i += 1) {
    const uri = params.localUris[i];
    try {
      const meta = await uploadSupportAttachment({
        userId: params.userId,
        conversationId: params.conversationId,
        localUri: uri,
        onProgress: (p) => params.onItemProgress?.(i, p),
      });
      results.push(meta);
    } catch (e) {
      throw new Error(
        getReadableErrorMessage(e, 'upload') ||
          'Could not upload one of your photos. Please try again.',
      );
    }
  }
  return results;
}
