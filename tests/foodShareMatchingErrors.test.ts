import { FOOD_SHARE_ERRORS, foodShareErrorMessage } from '@/lib/foodShareUx';

describe('foodShareErrorMessage swipe matching copy', () => {
  it('does not remap already-matched to match-full', () => {
    expect(foodShareErrorMessage(new Error('You already matched on this card.'))).toBe(
      FOOD_SHARE_ERRORS.alreadyMatched,
    );
    expect(foodShareErrorMessage(FOOD_SHARE_ERRORS.alreadyMatched)).toBe(
      FOOD_SHARE_ERRORS.alreadyMatched,
    );
  });

  it('maps genuine full errors to matchFull', () => {
    expect(foodShareErrorMessage(new Error('Match is already full.'))).toBe(
      FOOD_SHARE_ERRORS.matchFull,
    );
    expect(foodShareErrorMessage(new Error('This order is already full.'))).toBe(
      FOOD_SHARE_ERRORS.matchFull,
    );
    expect(foodShareErrorMessage(new Error('Order is full'))).toBe(
      FOOD_SHARE_ERRORS.matchFull,
    );
  });

  it('does not treat unrelated messages containing full as matchFull', () => {
    expect(
      foodShareErrorMessage(new Error('Could not fulfill request'), 'fallback'),
    ).toBe('fallback');
  });
});
