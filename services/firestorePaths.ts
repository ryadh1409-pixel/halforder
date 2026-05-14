/** Central Firestore collection ids for matching / growth features. */
export const FIRESTORE_COLLECTIONS = {
  orders: 'orders',
  /** Safe denormalized join-directory rows; synced from `orders` via Cloud Functions only. */
  publicMatchableOrders: 'public_matchable_orders',
  users: 'users',
  blocks: 'blocks',
} as const;
