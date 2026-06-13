import { auth, db } from '@/services/firebase';
import { profileFirestoreOp } from '@/services/profileFirestoreLog';
import { uploadProfilePhoto } from '@/services/profilePhoto';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export async function persistDriverProfilePhoto(
  uid: string,
  downloadURL: string,
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== uid) {
    throw new Error('User not authenticated');
  }

  await updateProfile(currentUser, { photoURL: downloadURL });

  const userRef = doc(db, 'users', uid);
  await profileFirestoreOp(
    {
      file: 'lib/driverProfilePhoto.ts',
      operation: 'setDoc(merge)',
      path: `users/${uid}`,
    },
    () =>
      setDoc(
        userRef,
        {
          photoURL: downloadURL,
          avatar: downloadURL,
          photo: downloadURL,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
  );

  const driverRef = doc(db, 'drivers', uid);
  await profileFirestoreOp(
    {
      file: 'lib/driverProfilePhoto.ts',
      operation: 'setDoc(merge)',
      path: `drivers/${uid}`,
    },
    () =>
      setDoc(
        driverRef,
        {
          photoURL: downloadURL,
          avatar: downloadURL,
          photo: downloadURL,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
  );
}

export async function uploadAndPersistDriverProfilePhoto(
  uid: string,
  localUri: string,
): Promise<string> {
  const downloadURL = await uploadProfilePhoto(localUri);
  await persistDriverProfilePhoto(uid, downloadURL);
  return downloadURL;
}
