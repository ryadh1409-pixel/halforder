/**
 * Verification that the Orders-screen restaurant-name bug is the truthy
 * "Unknown restaurant" short-circuit in `name || meta.name`.
 * Run: npx tsx tests/ordersRestaurantNameRootCause.test.ts
 * (or node after compile)
 */
import assert from 'node:assert/strict';

function formatRestaurantName(name: unknown): string {
  if (typeof name !== 'string') return 'Unknown restaurant';
  const trimmed = name.trim();
  return trimmed.length ? trimmed : 'Unknown restaurant';
}

function pickRestaurantName(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (trimmed.toLowerCase() === 'unknown restaurant') continue;
    return trimmed;
  }
  return 'Unknown restaurant';
}

/** Exact pre-fix merge expression from MarketplaceOrdersScreen. */
function oldMerge(mappedName: string, metaName: string | null): string {
  return formatRestaurantName(mappedName || metaName || '');
}

{
  const mapped = formatRestaurantName(''); // → Unknown restaurant
  const meta = 'Queen St Kitchen';
  assert.equal(mapped, 'Unknown restaurant');
  assert.equal(Boolean(mapped), true, 'Unknown restaurant is truthy');
  assert.equal(oldMerge(mapped, meta), 'Unknown restaurant');
  assert.equal(pickRestaurantName(mapped, meta), meta);
  console.log('PASS: empty order name + fetched meta — old ignores meta, new uses meta');
}

{
  const mapped = formatRestaurantName('Burger Spot');
  const meta = 'Queen St Kitchen';
  assert.equal(oldMerge(mapped, meta), 'Burger Spot');
  assert.equal(pickRestaurantName(mapped, meta), 'Burger Spot');
  console.log('PASS: order already has name — both keep order name');
}

console.log('Root cause verified.');
