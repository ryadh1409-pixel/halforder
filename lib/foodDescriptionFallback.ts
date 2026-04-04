/**
 * Short template blurbs when `aiDescription` is not stored (client-side only).
 */
export function foodDescriptionFallback(
  title: string,
  category?: string | null,
): string | null {
  const name = title.trim();
  if (!name) return null;
  const blob = `${name} ${category ?? ''}`.toLowerCase();

  if (/\bpizza\b|margherita|pepperoni|calzone/.test(blob)) {
    return 'Delicious cheesy pizza with a crispy crust, perfect for sharing.';
  }
  if (/\bburger\b|cheeseburger|slider/.test(blob)) {
    return 'A satisfying burger with fresh toppings and melted cheese.';
  }
  if (/\bwrap\b|shawarma|kebab|falafel|gyro|pita\b/.test(blob)) {
    return 'Juicy fillings wrapped with fresh veggies and bold flavor.';
  }
  if (/\bsalad\b|bowl\b.*green|caesar/.test(blob)) {
    return 'Crisp greens and fresh ingredients — light and refreshing.';
  }
  if (/\bsushi\b|maki|sashimi|roll\b.*tuna|poke\b/.test(blob)) {
    return 'Fresh, balanced bites with clean flavors and great texture.';
  }
  if (/\bpasta\b|spaghetti|carbonara|ravioli|lasagna|penne|fettuccine/.test(
    blob,
  )) {
    return 'Comforting pasta with a rich, savory sauce.';
  }
  if (/\btaco\b|burrito|quesadilla|enchilada|nachos/.test(blob)) {
    return 'Bold spices and hearty fillings in every bite.';
  }
  if (/\bsandwich\b|sub\b|panini|club\b/.test(blob)) {
    return 'Layered ingredients on fresh bread for a classic bite.';
  }
  if (/\bwings\b|nuggets|fried chicken|tenders/.test(blob)) {
    return 'Crispy outside, tender inside — great for sharing.';
  }
  if (/\bcoffee\b|latte|cappuccino|espresso|matcha/.test(blob)) {
    return 'A smooth pick-me-up with a rich aroma.';
  }
  if (/\bdessert\b|cake|brownie|cookie|ice cream|tiramisu/.test(blob)) {
    return 'A sweet treat to finish your meal.';
  }
  if (/\bbreakfast\b|brunch|pancake|waffle|omelet|bagel/.test(blob)) {
    return 'Hearty morning flavors to start the day right.';
  }
  if (/\bnoodle\b|ramen|pho|pad thai|udon|soba/.test(blob)) {
    return 'Warm, slurp-worthy noodles with savory broth or sauce.';
  }
  if (/\bsteak\b|ribs|bbq|grill/.test(blob)) {
    return 'Smoky, savory flavors cooked for maximum tenderness.';
  }
  if (/\bsoup\b|stew|chili\b/.test(blob)) {
    return 'Slow-simmered comfort in every spoonful.';
  }

  return `${name}: a tasty pick, great for sharing or enjoying solo.`;
}
