import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { auth, ensureAuthReady, storage } from '@/services/firebase';

export const uploadProfilePhoto = async (uri: string) => {
  try {
    if (!uri?.trim()) {
      throw new Error('No image selected');
    }

    await ensureAuthReady();

    const authInstance = getAuth();
    let user = auth.currentUser ?? authInstance.currentUser;

    if (!user) {
      // Fallback: ensure an authenticated session exists before upload.
      const credential = await signInAnonymously(authInstance);
      user = credential.user;
    }

    if (!user) {
      throw new Error('User not authenticated');
    }

    const storagePath = `profileImages/${user.uid}.jpg`;
    console.log('Uploading image URI:', uri);
    console.log('Upload user state:', {
      uid: user.uid,
      isAnonymous: user.isAnonymous,
    });
    console.log('Upload storage path:', storagePath);

    const response = await fetch(uri);
    const blob = await response.blob();
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  } catch (error) {
    console.error('UPLOAD FULL ERROR:', JSON.stringify(error));
    console.error('UPLOAD ERROR RAW:', error);
    throw error;
  }
};
