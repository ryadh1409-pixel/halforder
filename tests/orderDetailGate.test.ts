import { resolveOrderDetailGate } from '@/lib/orderDetailGate';

describe('resolveOrderDetailGate', () => {
  it('bypasses driver redirect for customer role', () => {
    const d = resolveOrderDetailGate({
      authReady: true,
      loading: false,
      roleResolved: true,
      firestoreUserRole: 'user',
      userUid: 'u1',
      orderId: 'ord-1',
      pathname: '/order/ord-1',
      segments: ['order', '[id]'],
    });
    expect(d.action).toBe('render');
    expect(d.reason).toBe('customer-workspace-bypass');
    expect(d.customerWorkspace).toBe(true);
    expect(d.driverWorkspace).toBe(false);
  });

  it('does not block customers on auth loading', () => {
    const d = resolveOrderDetailGate({
      authReady: false,
      loading: true,
      roleResolved: false,
      firestoreUserRole: 'user',
      userUid: 'u1',
      orderId: 'ord-1',
      pathname: '/order/ord-1',
      segments: ['order'],
    });
    expect(d.action).toBe('render');
    expect(d.reason).toBe('customer-workspace-bypass');
  });

  it('renders on root order route for drivers (no driver-shell redirect)', () => {
    const d = resolveOrderDetailGate({
      authReady: true,
      loading: false,
      roleResolved: true,
      firestoreUserRole: 'driver',
      userUid: 'd1',
      orderId: 'ord-1',
      pathname: '/order/ord-1',
      segments: ['order', '[id]'],
    });
    expect(d.action).toBe('render');
    expect(d.reason).toBe('default-render');
  });
});
