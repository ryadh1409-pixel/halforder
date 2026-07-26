import {
  EMPTY_DRIVER_VEHICLE,
  pickDriverVehicleFromDocs,
  type DriverVehicleInfo,
} from '@/lib/driverVehicle';
import { blobFromPickerUri } from '@/lib/imageBlob';
import { auth, db, ensureAuthReady, storage } from '@/services/firebase';
import { profileFirestoreOp } from '@/services/profileFirestoreLog';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

export function driverVehicleImageStoragePath(uid: string): string {
  return `drivers/${uid}/vehicle.jpg`;
}

export async function fetchDriverVehicleInfo(
  uid: string,
): Promise<DriverVehicleInfo> {
  try {
    const [userSnap, driverSnap] = await Promise.all([
      getDoc(doc(db, 'users', uid)),
      getDoc(doc(db, 'drivers', uid)),
    ]);
    return pickDriverVehicleFromDocs(
      userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : null,
      driverSnap.exists() ? (driverSnap.data() as Record<string, unknown>) : null,
    );
  } catch {
    return { ...EMPTY_DRIVER_VEHICLE };
  }
}

export async function persistDriverVehicleInfo(
  uid: string,
  info: DriverVehicleInfo,
): Promise<void> {
  await ensureAuthReady();
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== uid) {
    throw new Error('User not authenticated');
  }

  const payload = {
    vehiclePhoto: info.vehiclePhoto,
    vehicleMake: info.vehicleMake,
    vehicleModel: info.vehicleModel,
    vehicleYear: info.vehicleYear,
    vehicleColor: info.vehicleColor,
    licensePlate: info.licensePlate,
    updatedAt: serverTimestamp(),
  };

  await profileFirestoreOp(
    {
      file: 'lib/driverVehiclePhoto.ts',
      operation: 'setDoc(merge)',
      path: `users/${uid}`,
    },
    () => setDoc(doc(db, 'users', uid), payload, { merge: true }),
  );

  await profileFirestoreOp(
    {
      file: 'lib/driverVehiclePhoto.ts',
      operation: 'setDoc(merge)',
      path: `drivers/${uid}`,
    },
    () => setDoc(doc(db, 'drivers', uid), payload, { merge: true }),
  );
}

export async function uploadAndPersistDriverVehiclePhoto(
  uid: string,
  localUri: string,
): Promise<string> {
  await ensureAuthReady();
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== uid) {
    throw new Error('User not authenticated');
  }
  if (!localUri?.trim()) {
    throw new Error('No image selected');
  }

  const blob = await blobFromPickerUri(localUri.trim());
  const contentType =
    blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
  const storagePath = driverVehicleImageStoragePath(uid);
  const storageRef = ref(storage, storagePath);

  await profileFirestoreOp(
    {
      file: 'lib/driverVehiclePhoto.ts',
      operation: 'uploadBytes',
      path: storagePath,
    },
    () => uploadBytes(storageRef, blob, { contentType }),
  );

  const downloadURL = await profileFirestoreOp(
    {
      file: 'lib/driverVehiclePhoto.ts',
      operation: 'getDownloadURL',
      path: storagePath,
    },
    () => getDownloadURL(storageRef),
  );

  await profileFirestoreOp(
    {
      file: 'lib/driverVehiclePhoto.ts',
      operation: 'setDoc(merge)',
      path: `users/${uid}`,
    },
    () =>
      setDoc(
        doc(db, 'users', uid),
        { vehiclePhoto: downloadURL, updatedAt: serverTimestamp() },
        { merge: true },
      ),
  );

  await profileFirestoreOp(
    {
      file: 'lib/driverVehiclePhoto.ts',
      operation: 'setDoc(merge)',
      path: `drivers/${uid}`,
    },
    () =>
      setDoc(
        doc(db, 'drivers', uid),
        { vehiclePhoto: downloadURL, updatedAt: serverTimestamp() },
        { merge: true },
      ),
  );

  return downloadURL;
}
