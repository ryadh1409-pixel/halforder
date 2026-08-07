/**
 * EmoOrder — meal suggestions per restaurant type / name.
 * Since we don't have real menus for every restaurant, we generate
 * plausible suggestions based on cuisine type keywords.
 */

import type { EmoOrderMealSuggestion } from '@/types/emoOrder';

type MealTemplate = { name: string; estimatedPrice: number; emoji: string };

type CuisineEntry = {
  keywords: RegExp;
  meals: MealTemplate[];
};

const CUISINE_MEALS: CuisineEntry[] = [
  {
    keywords: /pizza|pizzeria|italian|napoli/i,
    meals: [
      { name: 'Margherita Pizza', estimatedPrice: 14.99, emoji: '🍕' },
      { name: 'Pepperoni Pizza', estimatedPrice: 16.99, emoji: '🍕' },
      { name: 'BBQ Chicken Pizza', estimatedPrice: 17.99, emoji: '🍕' },
      { name: 'Four Cheese Pizza', estimatedPrice: 15.99, emoji: '🍕' },
    ],
  },
  {
    keywords: /burger|grill|smash|bbq|smokehouse/i,
    meals: [
      { name: 'Classic Cheeseburger', estimatedPrice: 13.99, emoji: '🍔' },
      { name: 'Double Smash Burger', estimatedPrice: 17.99, emoji: '🍔' },
      { name: 'Bacon BBQ Burger', estimatedPrice: 16.99, emoji: '🍔' },
      { name: 'Veggie Burger', estimatedPrice: 14.99, emoji: '🌿' },
    ],
  },
  {
    keywords: /sushi|japanese|ramen|noodle|udon|izakaya/i,
    meals: [
      { name: 'Salmon Sashimi', estimatedPrice: 18.99, emoji: '🍱' },
      { name: 'Spicy Tuna Roll', estimatedPrice: 15.99, emoji: '🍣' },
      { name: 'Rainbow Roll', estimatedPrice: 19.99, emoji: '🍣' },
      { name: 'Tonkotsu Ramen', estimatedPrice: 16.99, emoji: '🍜' },
    ],
  },
  {
    keywords: /indian|curry|tandoor|biryani/i,
    meals: [
      { name: 'Butter Chicken', estimatedPrice: 16.99, emoji: '🍛' },
      { name: 'Lamb Biryani', estimatedPrice: 18.99, emoji: '🍛' },
      { name: 'Veggie Curry', estimatedPrice: 14.99, emoji: '🫛' },
      { name: 'Chicken Tikka Masala', estimatedPrice: 17.99, emoji: '🍛' },
    ],
  },
  {
    keywords: /chinese|dim sum|wok|canton|szechuan/i,
    meals: [
      { name: 'Kung Pao Chicken', estimatedPrice: 15.99, emoji: '🥡' },
      { name: 'Beef Fried Rice', estimatedPrice: 13.99, emoji: '🍚' },
      { name: 'Dim Sum Basket', estimatedPrice: 16.99, emoji: '🥟' },
      { name: 'Orange Chicken', estimatedPrice: 14.99, emoji: '🍊' },
    ],
  },
  {
    keywords: /mexican|taco|burrito|quesadilla|tex.mex/i,
    meals: [
      { name: 'Chicken Burrito', estimatedPrice: 13.99, emoji: '🌯' },
      { name: 'Tacos (3 pcs)', estimatedPrice: 12.99, emoji: '🌮' },
      { name: 'Beef Quesadilla', estimatedPrice: 11.99, emoji: '🫓' },
      { name: 'Nachos Supreme', estimatedPrice: 14.99, emoji: '🧀' },
    ],
  },
  {
    keywords: /thai|pad thai|green curry|mango/i,
    meals: [
      { name: 'Pad Thai', estimatedPrice: 15.99, emoji: '🍜' },
      { name: 'Green Curry', estimatedPrice: 16.99, emoji: '🍛' },
      { name: 'Mango Sticky Rice', estimatedPrice: 7.99, emoji: '🥭' },
      { name: 'Spring Rolls', estimatedPrice: 9.99, emoji: '🥙' },
    ],
  },
  {
    keywords: /chicken|poultry|wings|shawarma|wrap/i,
    meals: [
      { name: 'Chicken Shawarma', estimatedPrice: 13.99, emoji: '🌯' },
      { name: 'Crispy Chicken Sandwich', estimatedPrice: 14.99, emoji: '🥪' },
      { name: 'Buffalo Wings', estimatedPrice: 15.99, emoji: '🍗' },
      { name: 'Grilled Chicken Bowl', estimatedPrice: 14.99, emoji: '🥗' },
    ],
  },
  {
    keywords: /cafe|coffee|brunch|breakfast|bakery|pastry/i,
    meals: [
      { name: 'Avocado Toast', estimatedPrice: 12.99, emoji: '🥑' },
      { name: 'Eggs Benedict', estimatedPrice: 14.99, emoji: '🍳' },
      { name: 'French Toast', estimatedPrice: 11.99, emoji: '🍞' },
      { name: 'Smoked Salmon Bagel', estimatedPrice: 13.99, emoji: '🥯' },
    ],
  },
  {
    keywords: /poke|bowl|healthy|salad|vegan|vegetarian/i,
    meals: [
      { name: 'Salmon Poke Bowl', estimatedPrice: 16.99, emoji: '🥣' },
      { name: 'Tuna Poke Bowl', estimatedPrice: 17.99, emoji: '🥣' },
      { name: 'Quinoa Power Bowl', estimatedPrice: 14.99, emoji: '🥗' },
      { name: 'Acai Bowl', estimatedPrice: 12.99, emoji: '🫐' },
    ],
  },
];

const DEFAULT_MEALS: MealTemplate[] = [
  { name: 'Chef Special', estimatedPrice: 16.99, emoji: '⭐' },
  { name: 'Combo Plate', estimatedPrice: 14.99, emoji: '🍽' },
  { name: 'Grilled Protein Bowl', estimatedPrice: 15.99, emoji: '🥗' },
  { name: 'House Sandwich', estimatedPrice: 12.99, emoji: '🥪' },
];

/**
 * Returns meal suggestions for a restaurant based on its name and type.
 */
export function getMealSuggestionsForRestaurant(
  restaurantName: string,
  placeType: string | null,
): EmoOrderMealSuggestion[] {
  const target = `${restaurantName} ${placeType ?? ''}`;

  for (const entry of CUISINE_MEALS) {
    if (entry.keywords.test(target)) {
      return entry.meals.map((m) => ({ ...m }));
    }
  }

  return DEFAULT_MEALS.map((m) => ({ ...m }));
}

/**
 * Detect cuisine keyword from user message to refine restaurant search.
 */
export function detectCuisineFromMessage(text: string): string | null {
  const t = text.toLowerCase();
  if (/pizza|italian/.test(t)) return 'pizza restaurant';
  if (/burger|smash/.test(t)) return 'burger';
  if (/sushi|japanese|ramen/.test(t)) return 'sushi restaurant';
  if (/korean|bulgogi|bibimbap/.test(t)) return 'korean restaurant';
  if (/indian|curry|biryani/.test(t)) return 'indian restaurant';
  if (/chinese|dim sum/.test(t)) return 'chinese restaurant';
  if (/mexican|taco|burrito/.test(t)) return 'mexican restaurant';
  if (/thai|pad thai/.test(t)) return 'thai restaurant';
  if (/chicken|wings|shawarma/.test(t)) return 'chicken restaurant';
  if (/cafe|coffee|brunch|breakfast/.test(t)) return 'cafe';
  if (/poke|bowl|healthy|vegan/.test(t)) return 'healthy food';
  if (/sandwich|sub|wrap/.test(t)) return 'sandwich shop';
  if (/steak|steakhouse/.test(t)) return 'steakhouse';
  if (/seafood|fish|lobster/.test(t)) return 'seafood restaurant';
  if (/bbq|smokehouse/.test(t)) return 'bbq restaurant';
  return null;
}

/**
 * Detect food intent in user message (hunger, want food, etc.)
 */
export function detectFoodIntent(text: string): boolean {
  const t = text.toLowerCase();
  return /hungry|starving|food|eat|order|craving|meal|lunch|dinner|breakfast|snack|want something|i want|get me|can i get/.test(t);
}
