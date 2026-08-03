import {
  bearingDegrees,
  driverMarkerAnimationDurationMs,
  normalizeHeadingDegrees,
  resolveDriverMarkerHeading,
  validMapCoord,
} from '@/lib/maps/liveDriverMarker';

describe('liveDriverMarker helpers', () => {
  it('rejects null-island coordinates', () => {
    expect(validMapCoord({ latitude: 0, longitude: 0 })).toBeNull();
    expect(validMapCoord({ latitude: 43.65, longitude: -79.38 })).toEqual({
      latitude: 43.65,
      longitude: -79.38,
    });
  });

  it('computes bearing roughly east from A to B', () => {
    const bearing = bearingDegrees(
      { latitude: 43.65, longitude: -79.4 },
      { latitude: 43.65, longitude: -79.3 },
    );
    expect(bearing).toBeGreaterThan(70);
    expect(bearing).toBeLessThan(110);
  });

  it('prefers reported heading over derived bearing', () => {
    expect(
      resolveDriverMarkerHeading({
        reportedHeading: 45,
        previous: { latitude: 43.65, longitude: -79.4 },
        next: { latitude: 43.65, longitude: -79.3 },
      }),
    ).toBe(45);
  });

  it('derives heading from movement when GPS heading missing', () => {
    const heading = resolveDriverMarkerHeading({
      reportedHeading: null,
      previous: { latitude: 43.65, longitude: -79.4 },
      next: { latitude: 43.65, longitude: -79.3 },
    });
    expect(heading).toBeGreaterThan(70);
    expect(heading).toBeLessThan(110);
  });

  it('normalizes invalid headings', () => {
    expect(normalizeHeadingDegrees(-1)).toBeNull();
    expect(normalizeHeadingDegrees(370)).toBe(10);
  });

  it('scales animation duration with travel distance', () => {
    const a = { latitude: 43.65, longitude: -79.4 };
    const b = { latitude: 43.66, longitude: -79.39 };
    expect(driverMarkerAnimationDurationMs(null, b, 1)).toBe(0);
    expect(driverMarkerAnimationDurationMs(a, b, 0.0001)).toBe(400);
    expect(driverMarkerAnimationDurationMs(a, b, 0.2)).toBeGreaterThanOrEqual(700);
  });
});
