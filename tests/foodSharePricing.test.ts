import {
  buildAdminShareCostBreakdown,
  formatTimeRemaining,
} from '../lib/foodSharePricing';
import { describe, expect, it } from 'vitest';

describe('foodSharePricing', () => {
  it('builds admin share cost breakdown', () => {
    const breakdown = buildAdminShareCostBreakdown(24, 12, 3);
    expect(breakdown.sharedPrice).toBe(12);
    expect(breakdown.deliveryShare).toBe(3);
    expect(breakdown.totalPerUser).toBe(15);
  });

  it('formats time remaining', () => {
    const future = Date.now() + 45 * 60_000;
    expect(formatTimeRemaining(future)).toMatch(/m left/);
    expect(formatTimeRemaining(Date.now() - 1000)).toBe('Expired');
  });
});
