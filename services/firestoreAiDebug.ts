import type { DocumentData, QuerySnapshot } from 'firebase/firestore';

/** Development-only Firestore pipeline logs for AI / join-directory. */
export function shouldLogFirestoreAiPipeline(): boolean {
  return __DEV__;
}

export function logFirestoreSnapshotResult(
  snap: QuerySnapshot<DocumentData>,
  source: string,
): void {
  if (!shouldLogFirestoreAiPipeline()) return;
  console.log('[Firestore Result]', source, {
    size: snap.size,
    empty: snap.empty,
  });
  snap.forEach((doc) => {
    console.log('[Firestore Doc]', source, doc.id, doc.data());
  });
}
