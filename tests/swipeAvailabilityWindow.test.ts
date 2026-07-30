import { formatSwipeAvailabilityWindow } from '@/lib/swipeAvailabilityWindow';

describe('swipe availability window copy', () => {
  const now = new Date(2026, 6, 30, 12, 0).getTime();
  const at = (day: number, hour: number, minute = 0) =>
    new Date(2026, 6, day, hour, minute).getTime();

  it('shows nothing when the card has no window', () => {
    expect(
      formatSwipeAvailabilityWindow(
        { availableFromMs: null, availableUntilMs: null },
        now,
      ),
    ).toBeNull();
  });

  it('shows nothing for an open-ended live card', () => {
    expect(
      formatSwipeAvailabilityWindow(
        { availableFromMs: at(30, 9), availableUntilMs: null },
        now,
      ),
    ).toBeNull();
  });

  it('shows the closing time while the window is open today', () => {
    expect(
      formatSwipeAvailabilityWindow(
        { availableFromMs: at(30, 11), availableUntilMs: at(30, 17) },
        now,
      ),
    ).toEqual({ title: 'Today', detail: 'Until 5:00 PM' });
  });

  it('leads with the closing time when only an end is configured', () => {
    expect(
      formatSwipeAvailabilityWindow(
        { availableFromMs: null, availableUntilMs: at(30, 17) },
        now,
      ),
    ).toEqual({ title: 'Today', detail: 'Until 5:00 PM' });
  });

  it('counts down at exactly the three hour boundary', () => {
    expect(
      formatSwipeAvailabilityWindow(
        { availableFromMs: at(30, 11), availableUntilMs: at(30, 15) },
        now,
      ),
    ).toEqual({ title: 'Ends in 3 hours', detail: null });
  });

  it('counts down once the window is about to close', () => {
    expect(
      formatSwipeAvailabilityWindow(
        { availableFromMs: at(30, 11), availableUntilMs: at(30, 14) },
        now,
      ),
    ).toEqual({ title: 'Ends in 2 hours', detail: null });
    expect(
      formatSwipeAvailabilityWindow(
        { availableFromMs: at(30, 11), availableUntilMs: at(30, 12, 40) },
        now,
      ),
    ).toEqual({ title: 'Ends in 40 minutes', detail: null });
    expect(
      formatSwipeAvailabilityWindow(
        { availableFromMs: at(30, 11), availableUntilMs: at(30, 13) },
        now,
      ),
    ).toEqual({ title: 'Ends in 1 hour', detail: null });
  });

  it('never counts down past three hours', () => {
    expect(
      formatSwipeAvailabilityWindow(
        { availableFromMs: at(30, 11), availableUntilMs: at(30, 16) },
        now,
      ),
    ).toEqual({ title: 'Today', detail: 'Until 4:00 PM' });
  });

  it('names tomorrow for a window that closes the next day', () => {
    expect(
      formatSwipeAvailabilityWindow(
        { availableFromMs: at(30, 11), availableUntilMs: at(31, 15) },
        now,
      ),
    ).toEqual({ title: 'Ends tomorrow', detail: '3:00 PM' });
  });

  it('leads with tomorrow for a window that opens the next day', () => {
    expect(
      formatSwipeAvailabilityWindow(
        { availableFromMs: at(31, 10), availableUntilMs: at(31, 14) },
        now,
      ),
    ).toEqual({ title: 'Tomorrow', detail: '10:00 AM – 2:00 PM' });
  });

  it('names the day for a window further out', () => {
    const display = formatSwipeAvailabilityWindow(
      { availableFromMs: at(2 + 30, 10), availableUntilMs: at(2 + 30, 14) },
      now,
    );
    expect(display?.title).not.toBe('Today');
    expect(display?.title).not.toBe('Tomorrow');
    expect(display?.detail).toBe('10:00 AM – 2:00 PM');
  });

  it('keeps a later start on the same day as today', () => {
    expect(
      formatSwipeAvailabilityWindow(
        { availableFromMs: at(30, 18), availableUntilMs: at(30, 20) },
        now,
      ),
    ).toEqual({ title: 'Today', detail: '6:00 PM – 8:00 PM' });
  });

  it('spells out an end date beyond tomorrow', () => {
    const display = formatSwipeAvailabilityWindow(
      { availableFromMs: null, availableUntilMs: at(30 + 3, 15) },
      now,
    );
    expect(display?.title).toBe('Available until');
    expect(display?.detail).toContain('3:00 PM');
  });
});
