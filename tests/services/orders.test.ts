import { joinOrder } from '../../services/joinOrder';
import { planHalfOrderJoin } from '../../services/orders';

describe('orders service', () => {
  it('should create an order', async () => {
    // TODO: implement
    expect(typeof planHalfOrderJoin).toBe('function');
  });

  it('should join an order', async () => {
    // TODO: implement
    expect(typeof joinOrder).toBe('function');
  });

  it('should support order lifecycle transitions', () => {
    // TODO: implement
    expect(true).toBe(true);
  });
});
