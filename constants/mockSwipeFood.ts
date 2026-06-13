export type FoodOrderType =
  | 'pizza'
  | 'noodles'
  | 'burger'
  | 'salad'
  | 'dessert'
  | 'other';

/** High-quality hero images by food category (full-bleed cards). */
export const FOOD_HERO_IMAGE_BY_TYPE: Record<FoodOrderType, string> = {
  pizza:
    'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1600&q=85',
  noodles:
    'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1600&q=85',
  burger:
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1600&q=85',
  salad:
    'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1600&q=85',
  dessert:
    'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=1600&q=85',
  other:
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1600&q=85',
};

export function getHeroImageUrlForType(type: FoodOrderType): string {
  return FOOD_HERO_IMAGE_BY_TYPE[type] ?? FOOD_HERO_IMAGE_BY_TYPE.other;
}

/** Single swipe card — mock contract; hero image comes from `type` in UI. */
export type MockFoodCard = {
  id: string;
  title: string;
  type: FoodOrderType;
  price: number;
  time: string;
  distance: string;
  peopleJoined: number;
  spotsLeft: number;
};

/** Mock deck when no live open orders are available. */
export const mockOrders: MockFoodCard[] = [
  {
    id: '1',
    title: 'Pepperoni Pizza',
    type: 'pizza',
    price: 10,
    time: '20 min',
    distance: '0.5 km',
    peopleJoined: 2,
    spotsLeft: 1,
  },
  {
    id: '2',
    title: 'Cheese Pizza',
    type: 'pizza',
    price: 9,
    time: '18 min',
    distance: '0.7 km',
    peopleJoined: 1,
    spotsLeft: 2,
  },
  {
    id: '3',
    title: 'Veggie Pizza',
    type: 'pizza',
    price: 11,
    time: '22 min',
    distance: '1 km',
    peopleJoined: 3,
    spotsLeft: 1,
  },
  {
    id: '4',
    title: 'BBQ Chicken Pizza',
    type: 'pizza',
    price: 12,
    time: '25 min',
    distance: '0.8 km',
    peopleJoined: 2,
    spotsLeft: 2,
  },
  {
    id: '5',
    title: 'Margherita Pizza',
    type: 'pizza',
    price: 8,
    time: '15 min',
    distance: '0.6 km',
    peopleJoined: 1,
    spotsLeft: 1,
  },
  {
    id: '6',
    title: 'Smash Burger Combo',
    type: 'burger',
    price: 11,
    time: '15 min',
    distance: '0.4 km',
    peopleJoined: 2,
    spotsLeft: 1,
  },
  {
    id: '7',
    title: 'Truffle Cheeseburger',
    type: 'burger',
    price: 14,
    time: '18 min',
    distance: '0.9 km',
    peopleJoined: 1,
    spotsLeft: 2,
  },
  {
    id: '8',
    title: 'Spicy Dan Dan Noodles',
    type: 'noodles',
    price: 10,
    time: '17 min',
    distance: '0.5 km',
    peopleJoined: 3,
    spotsLeft: 1,
  },
  {
    id: '9',
    title: 'Chocolate Lava Cake',
    type: 'dessert',
    price: 12,
    time: '20 min',
    distance: '1.2 km',
    peopleJoined: 2,
    spotsLeft: 2,
  },
  {
    id: '10',
    title: 'Green Goddess Bowl',
    type: 'salad',
    price: 8,
    time: '14 min',
    distance: '0.3 km',
    peopleJoined: 1,
    spotsLeft: 1,
  },
];

/** @deprecated Use `mockOrders` */
export const MOCK_FOOD_CARDS = mockOrders;

/** First minutes digit sequence in `time` (e.g. "20 min" → 20) for countdown UI. */
export function parseMinutesFromTimeLabel(time: string): number {
  const m = /(\d+)/.exec(time);
  if (!m) return 30;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? Math.min(120, n) : 30;
}
