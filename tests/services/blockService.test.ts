import {
  blockUser,
  hasBlockBetween,
  isUserBlocked,
  unblockUser,
} from '@/services/blockService';
} from '../../services/blockService';

describe('blockService', () => {
  it('should block a user', async () => {
    // TODO: implement
    expect(typeof blockUser).toBe('function');
  });

  it('should unblock a user', async () => {
    // TODO: implement
    expect(typeof unblockUser).toBe('function');
  });

  it('should check blocked relationship', async () => {
    // TODO: implement
    expect(typeof isUserBlocked).toBe('function');
    expect(typeof hasBlockBetween).toBe('function');
  });
});
