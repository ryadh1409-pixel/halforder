import { userNeedsEmailVerification } from '../../lib/authEmailVerification';
import { ensureAuthReady } from '../../services/firebase';

describe('auth flows', () => {
  it('should support email sign in flow', async () => {
    // TODO: implement
    expect(typeof ensureAuthReady).toBe('function');
  });

  it('should support phone sign in flow', () => {
    // TODO: implement
    expect(true).toBe(true);
  });

  it('should gate unverified accounts', () => {
    // TODO: implement
    expect(typeof userNeedsEmailVerification).toBe('function');
  });
});
