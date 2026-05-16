/**
 * Sample menu documents for QA / Firebase Console seeding.
 * Path: `restaurants/{rid}/menuItems/{autoId}` with `createdAt`.
 */
export const SAMPLE_MENU_ITEMS_FOR_RESTAURANT = [
  {
    name: 'Truffle Garlic Fries',
    price: 7.49,
    image: null as string | null,
    available: true,
    description: 'Crisp fries, truffle oil, parmesan, fresh herbs.',
    category: 'Popular',
    tags: ['popular'],
    popular: true,
    recommended: false,
    promotion: null as string | null,
  },
  {
    name: 'Smash Burger Duo',
    price: 14.99,
    image: null,
    available: true,
    description: 'Two smashed patties, caramelized onions, house sauce.',
    category: 'Popular',
    tags: ['popular', 'bogo'],
    popular: true,
    recommended: true,
    promotion: 'BOGO',
  },
  {
    name: 'Iced Yuzu Tea',
    price: 4.25,
    image: null,
    available: true,
    description: 'Yuzu, jasmine tea, light sweetener.',
    category: 'Drinks',
    tags: [],
    popular: false,
    recommended: false,
    promotion: null,
  },
  {
    name: 'Dark Chocolate Basque',
    price: 8.5,
    image: null,
    available: true,
    description: 'Torched chocolate top, sea salt.',
    category: 'Desserts',
    tags: [],
    popular: false,
    recommended: true,
    promotion: null,
  },
] as const;
