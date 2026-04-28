import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import {
  blockUser as blockUserService,
  isUserBlocked as isUserBlockedService,
} from './blockService';

export async function reportAndBlock(
  reporterUid: string,
  reportedUid: string,
  orderId: string,
): Promise<void> {
  await addDoc(collection(db, 'reports'), {
    reporterId: reporterUid,
    reportedUserId: reportedUid,
    orderId,
    createdAt: serverTimestamp(),
  });
  await blockUserService(reporterUid, reportedUid);
}

export async function isBlockedByAny(
  blockedUid: string,
  blockerUids: string[],
): Promise<boolean> {
  if (blockerUids.length === 0) return false;
  for (const blockerUid of blockerUids) {
    if (await isUserBlockedService(blockedUid, blockerUid)) return true;
  }
  return false;
}

export async function hasBlockConflict(
  joinerUid: string,
  participants: string[],
): Promise<boolean> {
  for (const participantId of participants) {
    if (!participantId || participantId === joinerUid) continue;
    if (await isUserBlockedService(joinerUid, participantId)) {
      return true;
    }
  }
  return false;
}
