export type Deal = {
  id: string;
  title: string;
  price: string;
  originalDelivery: number;
  sharedDelivery: number;
  spotsLeft: number;
  endsInMinutes: number;
};

export type FoodTruck = {
  id: string;
  name: string;
  distance: string;
  menuPreview: string;
  originalDelivery: number;
  sharedDelivery: number;
  waitingCount: number;
  endsInMinutes: number;
};

export type ActiveOrder = {
  id: string;
  title: string;
  hostLabel: string;
  savingsText: string;
  waitingCount: number;
  endsInMinutes: number;
  originalDelivery: number;
  sharedDelivery: number;
};

export const HALFORDER_DEALS: Deal[] = [
  {
    id: 'deal-1',
    title: 'Burger + Fries',
    price: '$14.99',
    originalDelivery: 8,
    sharedDelivery: 3,
    spotsLeft: 3,
    endsInMinutes: 20,
  },
  {
    id: 'deal-2',
    title: 'Sushi Combo Box',
    price: '$18.50',
    originalDelivery: 9,
    sharedDelivery: 4,
    spotsLeft: 2,
    endsInMinutes: 15,
  },
  {
    id: 'deal-3',
    title: 'Chicken Shawarma',
    price: '$11.90',
    originalDelivery: 7,
    sharedDelivery: 2,
    spotsLeft: 4,
    endsInMinutes: 28,
  },
];

export const HALFORDER_FOOD_TRUCKS: FoodTruck[] = [
  {
    id: 'truck-1',
    name: 'Rolling Tacos',
    distance: '0.6 km',
    menuPreview: 'Beef taco, chicken burrito, churros',
    originalDelivery: 8,
    sharedDelivery: 3,
    waitingCount: 1,
    endsInMinutes: 15,
  },
  {
    id: 'truck-2',
    name: 'Wok Wheels',
    distance: '1.2 km',
    menuPreview: 'Chicken lo mein, fried rice, dumplings',
    originalDelivery: 7,
    sharedDelivery: 3,
    waitingCount: 2,
    endsInMinutes: 12,
  },
  {
    id: 'truck-3',
    name: 'Smash Bros Truck',
    distance: '1.8 km',
    menuPreview: 'Double smash burger, fries, lemonade',
    originalDelivery: 9,
    sharedDelivery: 4,
    waitingCount: 1,
    endsInMinutes: 18,
  },
];

export const HALFORDER_ACTIVE_ORDERS: ActiveOrder[] = [
  {
    id: 'order-1',
    title: 'Late-night Burger Run',
    hostLabel: 'Someone near you is ordering',
    savingsText: 'Save $5 on delivery',
    waitingCount: 1,
    endsInMinutes: 15,
    originalDelivery: 8,
    sharedDelivery: 3,
  },
  {
    id: 'order-2',
    title: 'Sushi Group Drop',
    hostLabel: '2 people nearby are ordering',
    savingsText: 'Save $4 on delivery',
    waitingCount: 2,
    endsInMinutes: 10,
    originalDelivery: 9,
    sharedDelivery: 5,
  },
];
