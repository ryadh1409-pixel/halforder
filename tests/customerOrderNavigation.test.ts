import { customerOrderDetailHref } from '@/lib/customerOrderNavigation';

describe('customerOrderDetailHref', () => {
  it('returns root-stack string path (not driver-relative object)', () => {
    expect(customerOrderDetailHref('ord-1')).toBe('/order/ord-1');
  });

  it('does not use pathname object form', () => {
    const href = customerOrderDetailHref('abc');
    expect(typeof href).toBe('string');
    expect(href).toMatch(/^\/order\//);
    expect(href).not.toContain('(driver)');
  });
});
