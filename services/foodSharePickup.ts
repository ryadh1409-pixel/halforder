import { functions } from '@/services/firebase';
import { httpsCallable } from 'firebase/functions';

export async function confirmFoodSharePickup(matchId: string): Promise<void> {
  const id = matchId.trim();
  if (!id) throw new Error('Missing match.');
  const fn = httpsCallable(functions, 'confirmFoodSharePickup');
  await fn({ matchId: id });
}
