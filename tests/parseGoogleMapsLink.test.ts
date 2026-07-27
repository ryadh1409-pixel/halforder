import { parseGoogleMapsLink } from '@/lib/maps/parseGoogleMapsLink';
import { describe, expect, it } from '@jest/globals';

describe('parseGoogleMapsLink', () => {
  it('parses place path query', () => {
    const parsed = parseGoogleMapsLink(
      'https://www.google.com/maps/place/Pizza+Nova/@43.65,-79.38,17z',
    );
    expect(parsed?.lat).toBeCloseTo(43.65);
    expect(parsed?.lng).toBeCloseTo(-79.38);
    expect(parsed?.query?.toLowerCase()).toContain('pizza');
  });

  it('parses q parameter', () => {
    const parsed = parseGoogleMapsLink(
      'https://maps.google.com/?q=Burger+King+Toronto',
    );
    expect(parsed?.query).toMatch(/Burger/i);
  });

  it('flags short links', () => {
    const parsed = parseGoogleMapsLink('https://maps.app.goo.gl/abc123');
    expect(parsed?.isShortLink).toBe(true);
  });
});
