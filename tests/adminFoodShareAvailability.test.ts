import {
  adminFoodShareAvailabilityStatus,
  nextAvailabilityBoundaryDelay,
  parseAvailabilityDateTime,
} from '@/lib/adminFoodShareAvailability';

describe('admin food share availability', () => {
  const now = new Date(2026, 6, 30, 12, 0).getTime();

  it('keeps legacy active cards live without a window', () => {
    expect(
      adminFoodShareAvailabilityStatus(
        { active: true, availableFromMs: null, availableUntilMs: null },
        now,
      ),
    ).toBe('live');
  });

  it('derives scheduled, live, and expired from the window', () => {
    const row = {
      active: true,
      availableFromMs: now + 1_000,
      availableUntilMs: now + 2_000,
    };
    expect(adminFoodShareAvailabilityStatus(row, now)).toBe('scheduled');
    expect(adminFoodShareAvailabilityStatus(row, now + 1_000)).toBe('live');
    expect(adminFoodShareAvailabilityStatus(row, now + 2_000)).toBe('live');
    expect(adminFoodShareAvailabilityStatus(row, now + 2_001)).toBe('expired');
  });

  it('keeps the active switch authoritative', () => {
    expect(
      adminFoodShareAvailabilityStatus(
        {
          active: false,
          availableFromMs: now - 1_000,
          availableUntilMs: now + 1_000,
        },
        now,
      ),
    ).toBe('inactive');
  });

  it('parses local admin date and time controls', () => {
    expect(parseAvailabilityDateTime('2026-07-30', '11:00')).toBe(
      new Date(2026, 6, 30, 11, 0).getTime(),
    );
    expect(parseAvailabilityDateTime('', '')).toBeNull();
    expect(() => parseAvailabilityDateTime('2026-02-30', '11:00')).toThrow();
  });

  it('schedules the nearest future boundary without another read', () => {
    expect(
      nextAvailabilityBoundaryDelay(
        [
          { availableFromMs: now + 5_000, availableUntilMs: now + 10_000 },
          { availableFromMs: now + 2_000, availableUntilMs: null },
        ],
        now,
      ),
    ).toBe(2_025);
  });
});
