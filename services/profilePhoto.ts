import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { blobFromPickerUri } from '../lib/imageBlob';
import { auth, ensureAuthReady, storage } from './firebase';

/** Matches Storage rules: `profiles/{auth.uid}.jpg` */
export function profileImageStoragePath(uid: string): string {
  return `profiles/${uid}.jpg`;
}

/** Upload profile image for a signed-in user → Storage download URL. */
export async function uploadUserProfileImage(
  uid: string,
  uri: string,
): Promise<string> {
  if (!uri?.trim()) {
    throw new Error('No image selected');
  }
  await ensureAuthReady();
  const user = auth.currentUser;
  if (!user || user.uid !== uid) {
    throw new Error('User not authenticated');
  }

  const blob = await blobFromPickerUri(uri.trim());
  const contentType =
    blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';

  const storageRef = ref(storage, profileImageStoragePath(uid));
  await uploadBytes(storageRef, blob, { contentType });
  return getDownloadURL(storageRef);
}

/** Current user convenience — same path as signup. */
export async function uploadProfilePhoto(uri: string): Promise<string> {
  await ensureAuthReady();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }
  return uploadUserProfileImage(user.uid, uri);
}
