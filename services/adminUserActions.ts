import type { User } from 'firebase/auth';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';

import { isAdminUser } from '../constants/adminUid';
import { db } from './firebase';

function assertAdminActor(
  actor: User | null,
  actorFirestoreRole: string | null | undefined,
): void {
  if (!isAdminUser(actor, actorFirestoreRole)) {
    throw new Error('Not authorized');
  }
}

/** Firestore only — sets `users/{userId}.role` to `admin`. */
export async function promoteUserToAdmin(
  actor: User | null,
  actorFirestoreRole: string | null | undefined,
  userId: string,
): Promise<void> {
  assertAdminActor(actor, actorFirestoreRole);
  const id = userId.trim();
  if (!id) throw new Error('Invalid user id');
  await updateDoc(doc(db, 'users', id), { role: 'admin' });
}

/** Firestore only — sets `users/{userId}.role` to `user`. */
export async function demoteUserFromAdmin(
  actor: User | null,
  actorFirestoreRole: string | null | undefined,
  userId: string,
): Promise<void> {
  assertAdminActor(actor, actorFirestoreRole);
  const id = userId.trim();
  if (!id) throw new Error('Invalid user id');
  await updateDoc(doc(db, 'users', id), { role: 'user' });
}

/** Firestore only — deletes `users/{userId}` (not Firebase Auth). */
export async function deleteUserDocumentAsAdmin(
  actor: User | null,
  actorFirestoreRole: string | null | undefined,
  userId: string,
): Promise<void> {
  assertAdminActor(actor, actorFirestoreRole);
  const id = userId.trim();
  if (!id) throw new Error('Invalid user id');
  await deleteDoc(doc(db, 'users', id));
}
