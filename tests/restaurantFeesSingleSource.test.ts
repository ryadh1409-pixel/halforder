import {
  deliveryFeeForTier,
  evaluateDeliveryEligibility,
  parseRestaurantDeliverySettings,
  resolveOrderDeliveryFee,
} from '@/lib/delivery/deliveryEligibility';
import { computeOrderPricing } from '@/lib/orderPricing';
import {
  calculateServiceFee,
  pickFirestoreServiceFee,
} from '@/lib/restaurantStoreMetrics';
import { parseTaxRate, resolveRestaurantTaxRate } from '@/services/platformFees';

jest.mock('@/services/firebase', () => ({ auth: {}, db: {} }));

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

/** Restaurant Fees exactly as the Admin Dashboard stores them. */
const CONFIGURED_RESTAURANT = {
  name: 'Configured Diner',
  deliveryFee: 0.5,
  serviceFee: 0.5,
  taxRate: 0.13,
  lat: 43.6532,
  lng: -79.3832,
};

/** Same restaurant without any fee configuration. */
const UNCONFIGURED_RESTAURANT = {
  name: 'Unconfigured Diner',
  lat: 43.6532,
  lng: -79.3832,
};

/** ~1.45 km away — the distance that produced the reported $2.08 delivery fee. */
const CUSTOMER_NEARBY = { lat: 43.666313, lng: -79.3832 };

describe('restaurant fees are the single source of truth', () => {
  it('reads the admin-configured delivery fee into delivery settings', () => {
    const settings = parseRestaurantDeliverySettings(CONFIGURED_RESTAURANT);
    expect(settings.configuredDeliveryFee).toBe(0.5);
    expect(parseRestaurantDeliverySettings(UNCONFIGURED_RESTAURANT).configuredDeliveryFee).toBeNull();
  });

  it('charges the configured delivery fee at every distance tier', () => {
    const settings = parseRestaurantDeliverySettings(CONFIGURED_RESTAURANT);
    for (const [tier, distanceKm] of [
      ['near', 1.45],
      ['medium', 7],
      ['long', 12],
    ] as const) {
      expect(deliveryFeeForTier(tier, distanceKm, settings)).toEqual({
        amount: 0.5,
        label: '$0.50',
      });
    }
  });

  it('never applies a distance surcharge on top of the configured fee', () => {
    const settings = parseRestaurantDeliverySettings({
      ...CONFIGURED_RESTAURANT,
      baseDeliveryFee: 4.99,
    });
    expect(deliveryFeeForTier('medium', 7, settings).amount).toBe(0.5);
  });

  it('shows free delivery when the configured fee is zero', () => {
    const settings = parseRestaurantDeliverySettings({
      ...CONFIGURED_RESTAURANT,
      deliveryFee: 0,
    });
    expect(deliveryFeeForTier('near', 1.45, settings)).toEqual({
      amount: 0,
      label: 'Free delivery',
    });
  });

  it('falls back to distance pricing only when no fee is configured', () => {
    const settings = parseRestaurantDeliverySettings(UNCONFIGURED_RESTAURANT);
    expect(deliveryFeeForTier('near', 1.45, settings).amount).toBeCloseTo(2.08, 2);
  });

  it('uses the configured fee end to end through delivery eligibility', () => {
    const eligibility = evaluateDeliveryEligibility({
      customer: CUSTOMER_NEARBY,
      restaurant: CONFIGURED_RESTAURANT,
      settings: parseRestaurantDeliverySettings(CONFIGURED_RESTAURANT),
      mode: 'delivery',
    });
    expect(eligibility.deliverable).toBe(true);
    expect(eligibility.deliveryFee.amount).toBe(0.5);

    const legacy = evaluateDeliveryEligibility({
      customer: CUSTOMER_NEARBY,
      restaurant: UNCONFIGURED_RESTAURANT,
      settings: parseRestaurantDeliverySettings(UNCONFIGURED_RESTAURANT),
      mode: 'delivery',
    });
    expect(legacy.deliveryFee.amount).toBeCloseTo(2.08, 2);
  });
});

describe('delivery fee written onto an order', () => {
  const configured = parseRestaurantDeliverySettings(CONFIGURED_RESTAURANT);
  const unconfigured = parseRestaurantDeliverySettings(UNCONFIGURED_RESTAURANT);

  it('ignores a stale checkout amount when a fee is configured', () => {
    expect(
      resolveOrderDeliveryFee({
        deliveryType: 'delivery',
        restaurantData: CONFIGURED_RESTAURANT,
        settings: configured,
        tier: 'near',
        distanceKm: 1.45,
        checkoutDeliveryFee: 2.08,
      }),
    ).toBe(0.5);
  });

  it('matches the checkout amount when checkout is in sync', () => {
    expect(
      resolveOrderDeliveryFee({
        deliveryType: 'delivery',
        restaurantData: CONFIGURED_RESTAURANT,
        settings: configured,
        tier: 'near',
        distanceKm: 1.45,
        checkoutDeliveryFee: 0.5,
      }),
    ).toBe(0.5);
  });

  it('charges nothing for pickup', () => {
    expect(
      resolveOrderDeliveryFee({
        deliveryType: 'pickup',
        restaurantData: CONFIGURED_RESTAURANT,
        settings: configured,
        tier: 'near',
        distanceKm: 1.45,
        checkoutDeliveryFee: 0.5,
      }),
    ).toBe(0);
  });

  it('preserves a free-delivery promotion', () => {
    const promo = { ...CONFIGURED_RESTAURANT, promotionBadges: ['free_delivery'] };
    expect(
      resolveOrderDeliveryFee({
        deliveryType: 'delivery',
        restaurantData: promo,
        settings: parseRestaurantDeliverySettings(promo),
        tier: 'near',
        distanceKm: 1.45,
        checkoutDeliveryFee: 0,
      }),
    ).toBe(0);
  });

  it('keeps the amount the customer saw when nothing is configured', () => {
    expect(
      resolveOrderDeliveryFee({
        deliveryType: 'delivery',
        restaurantData: UNCONFIGURED_RESTAURANT,
        settings: unconfigured,
        tier: 'near',
        distanceKm: 1.45,
        checkoutDeliveryFee: 2.08,
      }),
    ).toBe(2.08);
  });

  it('stores the same total the customer saw at checkout', () => {
    const subtotal = 20;
    const priorityFee = 2.49;
    const serviceFee = 0.5;
    const deliveryFee = 0.5;

    // Checkout groups the priority fee with delivery; the order document groups it with
    // the service fee. Both must produce the same tax and total.
    const shownAtCheckout = computeOrderPricing({
      foodSubtotal: subtotal,
      deliveryFee: deliveryFee + priorityFee,
      serviceFee,
      taxRate: 0.13,
    });
    const storedOnOrder = computeOrderPricing({
      foodSubtotal: subtotal,
      deliveryFee,
      serviceFee: serviceFee + priorityFee,
      taxRate: 0.13,
    });

    expect(storedOnOrder.totalPaid).toBe(shownAtCheckout.totalPaid);
    expect(storedOnOrder.hst).toBe(shownAtCheckout.hst);
  });

  it('falls back to the server estimate when checkout sent nothing', () => {
    expect(
      resolveOrderDeliveryFee({
        deliveryType: 'delivery',
        restaurantData: UNCONFIGURED_RESTAURANT,
        settings: unconfigured,
        tier: 'near',
        distanceKm: 1.45,
        checkoutDeliveryFee: null,
      }),
    ).toBeCloseTo(2.08, 2);
  });
});

describe('configured tax rate', () => {
  it('accepts the percentage the admin form collects', () => {
    expect(parseTaxRate(13)).toBeCloseTo(0.13, 5);
    expect(parseTaxRate(5)).toBeCloseTo(0.05, 5);
    expect(parseTaxRate(15)).toBeCloseTo(0.15, 5);
  });

  it('still accepts a stored fraction', () => {
    expect(parseTaxRate(0.13)).toBeCloseTo(0.13, 5);
    expect(parseTaxRate(0)).toBe(0);
  });

  it('uses the platform default only when the restaurant has no tax rate', () => {
    expect(resolveRestaurantTaxRate(CONFIGURED_RESTAURANT, 0.05)).toBeCloseTo(0.13, 5);
    expect(resolveRestaurantTaxRate(UNCONFIGURED_RESTAURANT, 0.05)).toBeCloseTo(0.05, 5);
  });
});

describe('fees resolve from the restaurant, never from menu data', () => {
  /** Mirrors how checkout builds the receipt: fees come from the restaurant doc only. */
  function priceMenuItem(
    restaurant: Record<string, unknown>,
    item: { id: string; price: number },
  ) {
    const settings = parseRestaurantDeliverySettings(restaurant);
    return computeOrderPricing({
      foodSubtotal: item.price,
      deliveryFee: deliveryFeeForTier('near', 1.45, settings).amount ?? 0,
      serviceFee:
        calculateServiceFee({
          subtotal: item.price,
          firestoreFee: pickFirestoreServiceFee(restaurant),
        }).amount ?? 0,
      taxRate: 0.13,
    });
  }

  const itemCreatedBeforeFeeChange = { id: 'legacy-item', price: 20 };
  const itemCreatedAfterFeeChange = { id: 'new-item', price: 20 };

  it('prices an old and a new menu item identically', () => {
    const oldItem = priceMenuItem(CONFIGURED_RESTAURANT, itemCreatedBeforeFeeChange);
    const newItem = priceMenuItem(CONFIGURED_RESTAURANT, itemCreatedAfterFeeChange);

    expect(oldItem.deliveryFee).toBe(0.5);
    expect(oldItem.serviceFee).toBe(0.5);
    expect(newItem).toEqual(oldItem);
  });

  it('applies an admin fee change to both items without recreating menus', () => {
    const updated = { ...CONFIGURED_RESTAURANT, deliveryFee: 1.25, serviceFee: 2 };
    const oldItem = priceMenuItem(updated, itemCreatedBeforeFeeChange);
    const newItem = priceMenuItem(updated, itemCreatedAfterFeeChange);

    expect(oldItem.deliveryFee).toBe(1.25);
    expect(oldItem.serviceFee).toBe(2);
    expect(newItem).toEqual(oldItem);
  });
});
