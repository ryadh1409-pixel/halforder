import {
  normalizePromotionBadges,
  parsePromotionBadge,
  promotionBadgesFromData,
} from '@/lib/promotionBadge';

describe('promotion badge multi-select storage', () => {
  it('reads a legacy single badge as a one-item list', () => {
    expect(promotionBadgesFromData({ promotionBadge: 'free_delivery' })).toEqual([
      'free_delivery',
    ]);
  });

  it('reads legacy camelCase badge values', () => {
    expect(parsePromotionBadge('freeDelivery')).toBe('free_delivery');
    expect(parsePromotionBadge('mostOrdered')).toBe('most_ordered');
    expect(promotionBadgesFromData({ promotionBadge: 'freeDelivery' })).toEqual([
      'free_delivery',
    ]);
  });

  it('reads a stored array and keeps its order', () => {
    expect(
      promotionBadgesFromData({
        promotionBadges: ['great_price', 'most_ordered'],
        promotionBadge: 'great_price',
      }),
    ).toEqual(['great_price', 'most_ordered']);
  });

  it('merges the legacy field without duplicating it', () => {
    expect(
      promotionBadgesFromData({
        promotionBadges: ['great_price'],
        promotionBadge: 'staff_pick',
      }),
    ).toEqual(['great_price', 'staff_pick']);
  });

  it('treats an empty selection as no badges', () => {
    expect(promotionBadgesFromData({ promotionBadges: [] })).toEqual([]);
    expect(promotionBadgesFromData({ promotionBadge: 'none' })).toEqual([]);
  });

  it('normalizes an admin selection for the save payload', () => {
    expect(
      normalizePromotionBadges([
        'free_delivery',
        'free_delivery',
        'none',
        'staff_pick',
        undefined,
      ]),
    ).toEqual(['free_delivery', 'staff_pick']);
    expect(normalizePromotionBadges([undefined])).toEqual([]);
  });
});
