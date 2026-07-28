/** Types for the Home "Repeat Order" recommendation + habit notifications. */

export type RepeatOrderItemSnapshot = {
  id: string;
  name: string;
  price: number;
  qty: number;
  image: string | null;
};

/** Lightweight completed-order row used for pattern detection. */
export type RepeatOrderHistoryEntry = {
  orderId: string;
  restaurantId: string;
  restaurantName: string;
  items: RepeatOrderItemSnapshot[];
  /** Stable signature of menu item ids (sorted). */
  itemSignature: string;
  totalPrice: number;
  /** Preferred completion time; falls back to createdAt. */
  orderedAtMs: number;
  estimatedDeliveryMinutes: number;
};

export type RepeatHabitKind =
  | 'daily'
  | 'weekly'
  | 'weekend'
  | 'lunch'
  | 'dinner'
  | 'late_night';

export type RepeatOrderCandidate = {
  restaurantId: string;
  restaurantName: string;
  itemSignature: string;
  /** Stable id for notification dedupe. */
  habitKey: string;
  /** Representative / most recent order in this pattern. */
  sourceOrderId: string;
  items: RepeatOrderItemSnapshot[];
  totalPrice: number;
  lastOrderedAtMs: number;
  estimatedDeliveryMinutes: number;
  frequency: number;
  /** Weekdays (0=Sun … 6=Sat) observed for this pattern. */
  weekdays: number[];
  /** Minutes-of-day for each historical order. */
  minutesOfDay: number[];
  /** Median usual ordering minute-of-day. */
  usualMinutesOfDay: number;
  habitKind: RepeatHabitKind;
  /** 0–1 confidence from frequency + consistency. */
  confidence: number;
};

export type RepeatOrderRecommendation = {
  restaurantId: string;
  restaurantName: string;
  sourceOrderId: string;
  habitKey: string;
  habitKind: RepeatHabitKind;
  items: RepeatOrderItemSnapshot[];
  /** Items still available after menu reconciliation. */
  availableItems: RepeatOrderItemSnapshot[];
  previousTotal: number;
  lastOrderedAtMs: number;
  estimatedDeliveryLabel: string;
  itemsSummary: string;
  hasAvailableOffer: boolean;
  hasShareAndSave: boolean;
  score: number;
  confidence: number;
  usualMinutesOfDay: number;
  /** Weekdays this habit typically occurs (0=Sun … 6=Sat). */
  weekdays: number[];
  /** Minutes until next usual order time (can be 0 when at/near usual). */
  minutesUntilUsual: number;
};

export type RepeatOrderSchedulePlan = {
  habitKey: string;
  restaurantId: string;
  restaurantName: string;
  itemSignature: string;
  habitKind: RepeatHabitKind;
  /** Absolute ms when the local notification should fire. */
  fireAtMs: number;
  /** Calendar day key for the habit occurrence (local). */
  dayKey: string;
  hasAvailableOffer: boolean;
  hasShareAndSave: boolean;
  usualMinutesOfDay: number;
};

export type RepeatOrderCachePayload = {
  uid: string;
  computedAtMs: number;
  /** Fingerprint of completed order ids used to build the cache. */
  historyFingerprint: string;
  recommendation: RepeatOrderRecommendation | null;
  /** Upcoming notification plans derived with the last compute. */
  schedulePlans?: RepeatOrderSchedulePlan[];
};

export type RepeatOrderNotifLog = {
  uid: string;
  /** `${dayKey}:${habitKey}` → notification identifier */
  sent: Record<string, string>;
};
