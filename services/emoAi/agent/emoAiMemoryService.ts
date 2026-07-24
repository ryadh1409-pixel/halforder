import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import { db } from '@/services/firebase';
import type { EmoAiUserMemory } from '@/types/emoAiAgent';

const LOCAL_KEY = (uid: string) => `emoAi.memory.v1.${uid}`;

const EMPTY_MEMORY: EmoAiUserMemory = {
  favoriteRestaurants: [],
  favoriteMeals: [],
  preferredSplitSize: null,
  savedCoupons: [],
  preferredFulfillment: null,
  notes: [],
  lastOrderIds: [],
  updatedAtMs: 0,
  conversationSummary: '',
  foodAllergies: [],
  dietaryPreferences: [],
  displayName: null,
  hiEmoooClaimed: false,
  previousGifts: [],
};

function normalizeMemory(raw: Partial<EmoAiUserMemory> | null | undefined): EmoAiUserMemory {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_MEMORY };
  return {
    favoriteRestaurants: Array.isArray(raw.favoriteRestaurants)
      ? raw.favoriteRestaurants.filter((x) => typeof x === 'string').slice(0, 20)
      : [],
    favoriteMeals: Array.isArray(raw.favoriteMeals)
      ? raw.favoriteMeals.filter((x) => typeof x === 'string').slice(0, 20)
      : [],
    preferredSplitSize:
      typeof raw.preferredSplitSize === 'number' && raw.preferredSplitSize > 0
        ? Math.min(12, Math.floor(raw.preferredSplitSize))
        : null,
    savedCoupons: Array.isArray(raw.savedCoupons)
      ? raw.savedCoupons.filter((x) => typeof x === 'string').slice(0, 20)
      : [],
    preferredFulfillment:
      raw.preferredFulfillment === 'delivery' || raw.preferredFulfillment === 'pickup'
        ? raw.preferredFulfillment
        : null,
    notes: Array.isArray(raw.notes)
      ? raw.notes.filter((x) => typeof x === 'string').slice(0, 30)
      : [],
    lastOrderIds: Array.isArray(raw.lastOrderIds)
      ? raw.lastOrderIds.filter((x) => typeof x === 'string').slice(0, 20)
      : [],
    updatedAtMs: typeof raw.updatedAtMs === 'number' ? raw.updatedAtMs : 0,
    conversationSummary:
      typeof raw.conversationSummary === 'string'
        ? raw.conversationSummary.trim().slice(0, 1200)
        : '',
    foodAllergies: Array.isArray(raw.foodAllergies)
      ? raw.foodAllergies.filter((x) => typeof x === 'string').slice(0, 20)
      : [],
    dietaryPreferences: Array.isArray(raw.dietaryPreferences)
      ? raw.dietaryPreferences.filter((x) => typeof x === 'string').slice(0, 20)
      : [],
    displayName:
      typeof raw.displayName === 'string' && raw.displayName.trim()
        ? raw.displayName.trim().slice(0, 80)
        : null,
    hiEmoooClaimed: raw.hiEmoooClaimed === true,
    previousGifts: Array.isArray(raw.previousGifts)
      ? raw.previousGifts.filter((x) => typeof x === 'string').slice(0, 20)
      : [],
  };
}

/** Load memory: AsyncStorage first, then Firestore profile doc. */
export async function loadEmoAiMemory(uid: string | null): Promise<EmoAiUserMemory> {
  if (!uid?.trim()) return { ...EMPTY_MEMORY };
  try {
    const local = await AsyncStorage.getItem(LOCAL_KEY(uid));
    if (local) {
      return normalizeMemory(JSON.parse(local) as Partial<EmoAiUserMemory>);
    }
  } catch {
    /* ignore */
  }
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'emoAiMemory', 'profile'));
    if (snap.exists()) {
      const mem = normalizeMemory(snap.data() as Partial<EmoAiUserMemory>);
      await AsyncStorage.setItem(LOCAL_KEY(uid), JSON.stringify(mem));
      return mem;
    }
  } catch {
    /* offline / rules */
  }
  return { ...EMPTY_MEMORY };
}

export async function saveEmoAiMemory(
  uid: string | null,
  patch: Partial<EmoAiUserMemory>,
): Promise<EmoAiUserMemory> {
  if (!uid?.trim()) return { ...EMPTY_MEMORY };
  const prev = await loadEmoAiMemory(uid);
  const next = normalizeMemory({
    ...prev,
    ...patch,
    favoriteRestaurants: patch.favoriteRestaurants ?? prev.favoriteRestaurants,
    favoriteMeals: patch.favoriteMeals ?? prev.favoriteMeals,
    savedCoupons: patch.savedCoupons ?? prev.savedCoupons,
    notes: patch.notes ?? prev.notes,
    lastOrderIds: patch.lastOrderIds ?? prev.lastOrderIds,
    foodAllergies: patch.foodAllergies ?? prev.foodAllergies,
    dietaryPreferences: patch.dietaryPreferences ?? prev.dietaryPreferences,
    previousGifts: patch.previousGifts ?? prev.previousGifts,
    updatedAtMs: Date.now(),
  });
  try {
    await AsyncStorage.setItem(LOCAL_KEY(uid), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  try {
    await setDoc(doc(db, 'users', uid, 'emoAiMemory', 'profile'), next, { merge: true });
  } catch {
    /* ignore */
  }
  return next;
}

/** Light extraction from a user utterance into memory updates. */
export async function learnFromUserMessage(
  uid: string | null,
  text: string,
): Promise<EmoAiUserMemory | null> {
  if (!uid?.trim() || !text.trim()) return null;
  const t = text.toLowerCase();
  // Ignore pure greetings for long-term memory.
  if (/^(hi|hey|hello|yo|sup|good\s*(morning|night|evening))[\s!.]*$/i.test(text.trim())) {
    return loadEmoAiMemory(uid);
  }

  const prev = await loadEmoAiMemory(uid);
  const patch: Partial<EmoAiUserMemory> = {};

  const favRest = t.match(/(?:favorite|favourite|love)\s+(?:restaurant\s+)?([a-z0-9 &'-+]{2,40})/i);
  if (favRest?.[1]) {
    const name = favRest[1].trim();
    patch.favoriteRestaurants = [...new Set([name, ...prev.favoriteRestaurants])].slice(0, 20);
  }
  const favFood = t.match(
    /(?:favorite|favourite|love|always\s+order)\s+(?:food\s+|meal\s+)?([a-z0-9 &'-+]{2,40})/i,
  );
  if (favFood?.[1] && !favRest) {
    patch.favoriteMeals = [...new Set([favFood[1].trim(), ...prev.favoriteMeals])].slice(0, 20);
  }
  const allergy = t.match(/allerg(?:ic|y)\s+to\s+([a-z0-9 &'-+,]{2,60})/i);
  if (allergy?.[1]) {
    const parts = allergy[1].split(/,|and/).map((s) => s.trim()).filter(Boolean);
    patch.foodAllergies = [...new Set([...(prev.foodAllergies ?? []), ...parts])].slice(0, 20);
  }
  if (/\bvegan\b/.test(t)) {
    patch.dietaryPreferences = [
      ...new Set([...(prev.dietaryPreferences ?? []), 'vegan']),
    ].slice(0, 20);
  }
  if (/\bvegetarian\b/.test(t)) {
    patch.dietaryPreferences = [
      ...new Set([...(prev.dietaryPreferences ?? []), 'vegetarian']),
    ].slice(0, 20);
  }
  if (/\bgluten[\s-]?free\b/.test(t)) {
    patch.dietaryPreferences = [
      ...new Set([...(prev.dietaryPreferences ?? []), 'gluten-free']),
    ].slice(0, 20);
  }
  if (/\bdelivery\b/.test(t) && /\bprefer\b|\balways\b/.test(t)) {
    patch.preferredFulfillment = 'delivery';
  }
  if (/\bpick\s*up\b|\bpickup\b/.test(t) && /\bprefer\b|\balways\b/.test(t)) {
    patch.preferredFulfillment = 'pickup';
  }
  const split = t.match(/split\s+(?:with\s+)?(\d+)/i);
  if (split?.[1]) {
    patch.preferredSplitSize = Number(split[1]);
  }
  const coupon = t.match(/(?:coupon|promo(?:\s*code)?)\s+([a-z0-9_-]{3,24})/i);
  if (coupon?.[1]) {
    patch.savedCoupons = [...new Set([coupon[1].toUpperCase(), ...prev.savedCoupons])].slice(
      0,
      20,
    );
  }

  // Compact rolling summary (not full history).
  if (text.trim().length > 12 && !/^(hi|hey|hello)\b/i.test(text.trim())) {
    const line = text.trim().replace(/\s+/g, ' ').slice(0, 140);
    const prevSummary = (prev.conversationSummary || '').trim();
    const nextSummary = prevSummary
      ? `${prevSummary} | ${line}`.slice(-1100)
      : line;
    patch.conversationSummary = nextSummary;
  }

  if (Object.keys(patch).length === 0) return prev;
  return saveEmoAiMemory(uid, patch);
}

export function formatMemoryForPrompt(memory: EmoAiUserMemory | null): string {
  if (!memory || memory.updatedAtMs <= 0) return 'No saved preferences yet.';
  const lines: string[] = [];
  if (memory.displayName) lines.push(`Name: ${memory.displayName}`);
  if (memory.favoriteRestaurants.length) {
    lines.push(`Favorite restaurants: ${memory.favoriteRestaurants.join(', ')}`);
  }
  if (memory.favoriteMeals.length) {
    lines.push(`Favorite meals: ${memory.favoriteMeals.join(', ')}`);
  }
  if (memory.foodAllergies?.length) {
    lines.push(`Allergies: ${memory.foodAllergies.join(', ')}`);
  }
  if (memory.dietaryPreferences?.length) {
    lines.push(`Dietary: ${memory.dietaryPreferences.join(', ')}`);
  }
  if (memory.preferredSplitSize) {
    lines.push(`Preferred split size: ${memory.preferredSplitSize}`);
  }
  if (memory.savedCoupons.length) {
    lines.push(`Saved coupons: ${memory.savedCoupons.join(', ')}`);
  }
  if (memory.preferredFulfillment) {
    lines.push(`Preferred fulfillment: ${memory.preferredFulfillment}`);
  }
  if (memory.hiEmoooClaimed) {
    lines.push('Already claimed Hi emooo gift: yes');
  }
  if (memory.previousGifts?.length) {
    lines.push(`Previous gifts: ${memory.previousGifts.join(', ')}`);
  }
  if (memory.conversationSummary) {
    lines.push(`Prior chat summary: ${memory.conversationSummary}`);
  }
  if (memory.notes.length) {
    lines.push(`Notes: ${memory.notes.slice(0, 5).join('; ')}`);
  }
  return lines.length ? lines.join('\n') : 'No saved preferences yet.';
}

/** Natural returning-user greeting when visible chat was cleared. */
export function buildMemoryAwareGreeting(
  memory: EmoAiUserMemory | null,
  userDisplayName: string | null,
): string {
  const name =
    (userDisplayName || memory?.displayName || '').trim().split(/\s+/)[0] ||
    'friend';
  const fav =
    memory?.favoriteMeals?.[0] ||
    memory?.favoriteRestaurants?.[0] ||
    null;
  if (fav) {
    return `Welcome back, ${name}! Last time you told me you love ${fav}. What are you craving today?`;
  }
  return `Welcome back, ${name}! What are you craving today?`;
}
