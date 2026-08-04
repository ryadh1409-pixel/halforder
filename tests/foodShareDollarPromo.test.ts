import {
  isFoodShareDollarPromoEnabled,
  parseFoodShareDollarPromoTarget,
  resolveFoodShareDollarPromoDiscount,
  resolveMatchParticipantRole,
  type FoodShareDollarPromoTarget,
} from '@/lib/foodShareDollarPromo';

describe('foodShareDollarPromo', () => {
  it('defaults target to both', () => {
    expect(parseFoodShareDollarPromoTarget(undefined)).toBe('both');
  });

  it('applies $1 to first user only', () => {
    const target: FoodShareDollarPromoTarget = 'first';
    expect(
      resolveFoodShareDollarPromoDiscount({
        enabled: true,
        target,
        participant: 'first',
      }),
    ).toBe(1);
    expect(
      resolveFoodShareDollarPromoDiscount({
        enabled: true,
        target,
        participant: 'second',
      }),
    ).toBe(0);
  });

  it('applies $1 to second user only', () => {
    expect(
      resolveFoodShareDollarPromoDiscount({
        enabled: true,
        target: 'second',
        participant: 'second',
      }),
    ).toBe(1);
    expect(
      resolveFoodShareDollarPromoDiscount({
        enabled: true,
        target: 'second',
        participant: 'first',
      }),
    ).toBe(0);
  });

  it('applies $1 to both users', () => {
    expect(
      resolveFoodShareDollarPromoDiscount({
        enabled: true,
        target: 'both',
        participant: 'first',
      }),
    ).toBe(1);
    expect(
      resolveFoodShareDollarPromoDiscount({
        enabled: true,
        target: 'both',
        participant: 'second',
      }),
    ).toBe(1);
  });

  it('resolves match participant roles from users[]', () => {
    expect(resolveMatchParticipantRole('a', ['a', 'b'])).toBe('first');
    expect(resolveMatchParticipantRole('b', ['a', 'b'])).toBe('second');
    expect(resolveMatchParticipantRole('c', ['a', 'b'])).toBeNull();
  });

  it('parses enabled flag', () => {
    expect(isFoodShareDollarPromoEnabled(true)).toBe(true);
    expect(isFoodShareDollarPromoEnabled(false)).toBe(false);
  });
});
