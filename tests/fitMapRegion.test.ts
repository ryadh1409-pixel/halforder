import {
  areMapCoordinatesDistinct,
  fitMapToCoordinates,
} from '@/lib/maps/fitMapRegion';

describe('areMapCoordinatesDistinct', () => {
  it('returns false for identical coordinates', () => {
    expect(
      areMapCoordinatesDistinct([
        { latitude: 43.65, longitude: -79.38 },
        { latitude: 43.65, longitude: -79.38 },
      ]),
    ).toBe(false);
  });

  it('returns false for nearly identical coordinates', () => {
    expect(
      areMapCoordinatesDistinct([
        { latitude: 43.65, longitude: -79.38 },
        { latitude: 43.65000005, longitude: -79.38000005 },
      ]),
    ).toBe(false);
  });

  it('returns true for separated coordinates', () => {
    expect(
      areMapCoordinatesDistinct([
        { latitude: 43.65, longitude: -79.38 },
        { latitude: 43.66, longitude: -79.39 },
      ]),
    ).toBe(true);
  });
});

describe('fitMapToCoordinates', () => {
  it('uses animateToRegion instead of fit when points overlap', () => {
    const fitToCoordinates = jest.fn();
    const animateToRegion = jest.fn();
    const result = fitMapToCoordinates(
      { fitToCoordinates, animateToRegion },
      [
        { latitude: 43.65, longitude: -79.38 },
        { latitude: 43.65, longitude: -79.38 },
      ],
    );
    expect(result.usedDefaultRegion).toBe(true);
    expect(fitToCoordinates).not.toHaveBeenCalled();
    expect(animateToRegion).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 43.65,
        longitude: -79.38,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }),
      500,
    );
  });

  it('calls fitToCoordinates when points are distinct', () => {
    const fitToCoordinates = jest.fn();
    const animateToRegion = jest.fn();
    const result = fitMapToCoordinates(
      { fitToCoordinates, animateToRegion },
      [
        { latitude: 43.65, longitude: -79.38 },
        { latitude: 43.67, longitude: -79.4 },
      ],
    );
    expect(result.usedDefaultRegion).toBe(false);
    expect(fitToCoordinates).toHaveBeenCalled();
    expect(animateToRegion).not.toHaveBeenCalled();
  });
});
