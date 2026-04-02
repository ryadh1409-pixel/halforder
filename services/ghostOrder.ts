import type { TimeContext, TimeOfDayPeriod } from '@/services/chatAssistantOrders';

export type GhostMessageOrder = {
  id: string;
  title: string;
  isGhost: true;
  priceSplit: string;
  peopleNeeded: number;
};

const GHOST_TITLE_BY_PERIOD: Record<TimeOfDayPeriod, string> = {
  morning: 'Coffee & bakery near you ☕',
  lunch: 'Pizza near you 🍕',
  evening: 'Dinner near you 🍽️',
  late_night: 'Snack run near you 🌙',
};

/**
 * Temporary in-app-only order suggestion (never written to Firestore).
 */
export function generateGhostOrder(ctx: TimeContext): GhostMessageOrder {
  const ts = Date.now();
  return {
    id: `ghost_${ts}`,
    title: GHOST_TITLE_BY_PERIOD[ctx.period],
    isGhost: true,
    priceSplit: '$8',
    peopleNeeded: 1,
  };
}

export const GHOST_JOIN_BOT_COPY =
  'No active orders… but I found someone who wants to split 🍕';
