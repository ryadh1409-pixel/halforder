import { httpsCallable } from 'firebase/functions';

import { functions, syncAuthForFirestoreReads } from '@/services/firebase';

/**
 * Short menu-style blurb for a swipe card via Firebase Callable.
 * OpenAI secret never leaves the backend.
 */
export async function generateFoodCardAiDescription(input: {
  title: string;
  restaurantName: string;
  adminDescription?: string;
}): Promise<string | null> {
  const title = input.title.trim();
  const restaurant = input.restaurantName.trim();
  const hint = (input.adminDescription ?? '').trim();

  try {
    await syncAuthForFirestoreReads();
    const fn = httpsCallable(functions, 'generateFoodCardDescription');
    const result = await fn({
      title,
      restaurantName: restaurant,
      adminDescription: hint,
    });
    const data = result.data as { description?: unknown };
    const text =
      typeof data?.description === 'string' ? data.description.trim() : '';
    return text ? text.slice(0, 400) : null;
  } catch (e) {
    console.warn('[foodCardAiDescription] callable failed', e);
    return null;
  }
}
