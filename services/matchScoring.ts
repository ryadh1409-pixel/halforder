import { GROWTH_MATCH_RADIUS_KM } from '@/constants/growth';

/** Minimal user context for ranking (reserved for future prefs). */
export type MatchScoringUser = {
  food: string;
  lat: number;
  lng: number;
};

/** Signals derived from `public_matchable_orders` + geo filter. */
export type MatchScoringOrder = {
  distanceMeters: number | null;
  foodMatchStrength: number;
  etaMinutes?: number | null;
  slotsOpen?: number;
  maxSlots?: number;
  createdAtMs?: number | null;
};

function normalizeFood(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * 0–1 overlap between the user's food intent and directory haystack text.
 */
export function foodPreferenceStrength(userFood: string, haystack: string): number {
  const u = normalizeFood(userFood);
  const h = normalizeFood(haystack);
  if (!u) return 1;
  if (h.includes(u)) return 1;
  const tokens = u.split(' ').filter((t) => t.length > 2);
  if (tokens.length === 0) return 0.55;
  const hits = tokens.filter((t) => h.includes(t)).length;
  return Math.max(0.18, hits / tokens.length);
}

export function foodsAlignForMatch(userFood: string, haystack: string): boolean {
  if (!normalizeFood(userFood)) return true;
  return foodPreferenceStrength(userFood, haystack) >= 0.18;
}

const W_DIST = 28;
const W_FOOD = 22;
const W_ETA = 15;
const W_SLOTS = 12;
const W_FRESH = 13;
const W_POP = 10;

function distPoints(distanceMeters: number | null, radiusM: number): number {
  if (distanceMeters == null) return W_DIST * 0.35;
  if (distanceMeters > radiusM) return 0;
  return W_DIST * (1 - distanceMeters / radiusM);
}

function etaPoints(etaMinutes: number | null | undefined): number {
  if (etaMinutes == null || !Number.isFinite(etaMinutes)) return W_ETA * 0.55;
  const e = Math.max(0, etaMinutes);
  if (e <= 12) return W_ETA;
  if (e >= 55) return 0;
  return W_ETA * (1 - (e - 12) / 43);
}

function slotsPoints(slotsOpen: number | undefined, maxSlots: number | undefined): number {
  const max = typeof maxSlots === 'number' && maxSlots > 0 ? maxSlots : 0;
  const open = typeof slotsOpen === 'number' && slotsOpen >= 0 ? slotsOpen : 0;
  if (max <= 0) return W_SLOTS * 0.45;
  const ratio = Math.min(1, open / max);
  return W_SLOTS * ratio;
}

function freshnessPoints(createdAtMs: number | null | undefined, nowMs: number): number {
  if (createdAtMs == null || !Number.isFinite(createdAtMs)) return W_FRESH * 0.5;
  const ageMin = (nowMs - createdAtMs) / 60_000;
  if (ageMin <= 8) return W_FRESH;
  if (ageMin >= 240) return 0;
  return W_FRESH * (1 - (ageMin - 8) / 232);
}

function popularityPoints(slotsOpen: number | undefined, maxSlots: number | undefined): number {
  const max = typeof maxSlots === 'number' && maxSlots > 0 ? maxSlots : 0;
  const open = typeof slotsOpen === 'number' && slotsOpen >= 0 ? slotsOpen : 0;
  if (max <= 0) return W_POP * 0.35;
  const joined = Math.max(0, Math.min(max, max - open));
  const fill = joined / max;
  return W_POP * fill;
}

/**
 * Normalized match quality 0–100 (distance, food overlap, ETA, open slots, freshness, fill).
 */
export function calculateMatchScore(
  order: MatchScoringOrder,
  _user: MatchScoringUser,
  options?: { radiusMeters?: number; nowMs?: number },
): number {
  const radiusM =
    options?.radiusMeters ?? GROWTH_MATCH_RADIUS_KM * 1000;
  const nowMs = options?.nowMs ?? Date.now();

  const raw =
    distPoints(order.distanceMeters, radiusM) +
    W_FOOD * Math.min(1, Math.max(0, order.foodMatchStrength)) +
    etaPoints(order.etaMinutes ?? null) +
    slotsPoints(order.slotsOpen, order.maxSlots) +
    freshnessPoints(order.createdAtMs ?? null, nowMs) +
    popularityPoints(order.slotsOpen, order.maxSlots);

  return Math.round(Math.min(100, Math.max(0, raw)));
}
