/**
 * Menu data layer — paths and helpers aligned with Firebase.
 *
 * Reads are implemented via `getFoodItems` (realtime) in `foodService.ts`
 * and `useRestaurantProfile` for `restaurants/{id}`.
 */

/** Parent collection for restaurant storefront docs. */
export const RESTAURANTS_COLLECTION = 'restaurants';

export function restaurantDocPath(restaurantId: string): string {
  return `${RESTAURANTS_COLLECTION}/${restaurantId}`;
}

export function menuItemsCollectionPath(restaurantId: string): string {
  return `${RESTAURANTS_COLLECTION}/${restaurantId}/menuItems`;
}

/** Reserved category labels used by the premium UI rails (case-insensitive match on `FoodItem.category`). */
export const PREMIUM_MENU_KEYWORDS = {
  drinks: ['drink', 'beverage', 'coffee', 'smoothie', 'juice', 'soda'],
  desserts: ['dessert', 'sweet', 'cake', 'ice cream', 'bakery'],
} as const;
