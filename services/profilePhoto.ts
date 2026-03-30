import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { storage } from '@/services/firebase';

export async function uploadProfilePhoto(
  imageUri: string,
): Promise<string> {
  if (!imageUri?.trim()) {
    throw new Error('No image selected.');
  }

  try {
    const response = await fetch(imageUri);
    const blob = await response.blob();
    const fileName = `profile_${Date.now()}.jpg`;
    const storageRef = ref(storage, `profiles/${fileName}`);
    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  } catch (error) {
    console.log('Upload error:', error);
    throw error;
  }
}
