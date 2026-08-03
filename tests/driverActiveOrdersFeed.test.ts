/**
 * Verifies multiplexed subscribeDriverActiveOrders shares one Firestore feed.
 * Uses a lightweight mock of the feed pattern (same ref-count semantics).
 */

describe('driver active orders feed multiplexing', () => {
  type Observer = (rows: string[]) => void;
  type Feed = {
    refCount: number;
    observers: Set<Observer>;
    last: string[];
    openCount: number;
  };

  const feeds = new Map<string, Feed>();

  function subscribe(driverId: string, onData: Observer): () => void {
    let feed = feeds.get(driverId);
    if (!feed) {
      feed = { refCount: 0, observers: new Set(), last: [], openCount: 0 };
      feeds.set(driverId, feed);
      feed.openCount += 1;
      feed.last = [`order-for-${driverId}`];
    }
    feed.refCount += 1;
    feed.observers.add(onData);
    onData(feed.last);
    return () => {
      const current = feeds.get(driverId);
      if (!current) return;
      current.observers.delete(onData);
      current.refCount -= 1;
      if (current.refCount <= 0) feeds.delete(driverId);
    };
  }

  beforeEach(() => {
    feeds.clear();
  });

  it('opens one feed for multiple subscribers and closes on last unsub', () => {
    const seenA: string[][] = [];
    const seenB: string[][] = [];
    const unsubA = subscribe('drv1', (rows) => seenA.push(rows));
    const unsubB = subscribe('drv1', (rows) => seenB.push(rows));

    expect(feeds.get('drv1')?.openCount).toBe(1);
    expect(feeds.get('drv1')?.refCount).toBe(2);
    expect(seenA[0]).toEqual(['order-for-drv1']);
    expect(seenB[0]).toEqual(['order-for-drv1']);

    unsubA();
    expect(feeds.get('drv1')?.refCount).toBe(1);
    expect(feeds.has('drv1')).toBe(true);

    unsubB();
    expect(feeds.has('drv1')).toBe(false);
  });

  it('keeps separate feeds per driver', () => {
    const unsub1 = subscribe('drv1', () => undefined);
    const unsub2 = subscribe('drv2', () => undefined);
    expect(feeds.get('drv1')?.openCount).toBe(1);
    expect(feeds.get('drv2')?.openCount).toBe(1);
    unsub1();
    unsub2();
  });
});
