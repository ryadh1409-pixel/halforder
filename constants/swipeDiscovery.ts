/** Swipe discovery filter chips — viral food matching tab. */
export type SwipeFilterKey =
  | 'for-you'
  | 'vegetarian'
  | 'pizza'
  | 'burgers'
  | 'late-night'
  | 'cheap-eats'
  | 'desserts';

export const SWIPE_FILTER_CHIPS: { key: SwipeFilterKey; label: string }[] = [
  { key: 'for-you', label: 'For You' },
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'pizza', label: 'Pizza' },
  { key: 'burgers', label: 'Burgers' },
  { key: 'late-night', label: 'Late Night' },
  { key: 'cheap-eats', label: 'Cheap Eats' },
  { key: 'desserts', label: 'Desserts' },
];

export function matchesSwipeFilter(
  card: { categories: string[]; type?: string; title?: string; price?: number },
  filter: SwipeFilterKey,
): boolean {
  if (filter === 'for-you') return true;
  if (card.categories.includes(filter)) return true;
  const t = (card.title ?? '').toLowerCase();
  switch (filter) {
    case 'vegetarian':
      return t.includes('veggie') || t.includes('vegetarian') || card.categories.includes('vegetarian');
    case 'pizza':
      return card.type === 'pizza' || t.includes('pizza');
    case 'burgers':
      return t.includes('burger') || card.categories.includes('burgers');
    case 'late-night':
      return card.categories.includes('late-night');
    case 'cheap-eats':
      return (card.price ?? 99) <= 12;
    case 'desserts':
      return t.includes('dessert') || t.includes('cake') || card.categories.includes('desserts');
    default:
      return false;
  }
}
