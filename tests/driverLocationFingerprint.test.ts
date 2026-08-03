import { driverLocationFingerprint } from '@/lib/customerOrderSnapshotSignature';

describe('driverLocationFingerprint', () => {
  it('returns empty for missing driverLocation', () => {
    expect(driverLocationFingerprint({})).toBe('');
  });

  it('returns empty for empty map (must not be ",,")', () => {
    expect(driverLocationFingerprint({ driverLocation: {} })).toBe('');
  });

  it('returns empty for null-island', () => {
    expect(
      driverLocationFingerprint({
        driverLocation: { lat: 0, lng: 0 },
      }),
    ).toBe('');
  });

  it('fingerprints finite coords + heading', () => {
    expect(
      driverLocationFingerprint({
        driverLocation: { latitude: 43.65, longitude: -79.38, heading: 90 },
      }),
    ).toBe('43.65,-79.38,90');
  });
});
