import type { HomeBannerDoc, HomeBannerSettings } from '@/types/homeBanner';
import { auth, db } from '@/services/firebase';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';

const BANNERS_COLLECTION = 'homeBanners';
const SETTINGS_DOC = ['platformSettings', 'homeBanners'] as const;

const DEFAULT_SETTINGS: HomeBannerSettings = { visible: true };

function parseBanner(id: string, data: Record<string, unknown>): HomeBannerDoc {
  return {
    id,
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl.trim() : '',
    badgeText: typeof data.badgeText === 'string' ? data.badgeText.trim() : '',
    headline: typeof data.headline === 'string' ? data.headline.trim() : '',
    subtitle: typeof data.subtitle === 'string' ? data.subtitle.trim() : '',
    buttonText: typeof data.buttonText === 'string' ? data.buttonText.trim() : '',
    buttonDestination:
      typeof data.buttonDestination === 'string'
        ? data.buttonDestination.trim()
        : '',
    sortOrder:
      typeof data.sortOrder === 'number' && Number.isFinite(data.sortOrder)
        ? Math.floor(data.sortOrder)
        : 0,
    active: data.active !== false,
  };
}

function sortBanners(rows: HomeBannerDoc[]): HomeBannerDoc[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export function subscribeHomeBannerSettings(
  onData: (settings: HomeBannerSettings) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, SETTINGS_DOC[0], SETTINGS_DOC[1]),
    (snap) => {
      const data = snap.data() as Record<string, unknown> | undefined;
      onData({
        visible: data?.visible !== false,
      });
    },
    (e) => {
      onError?.(e instanceof Error ? e : new Error('Failed to load banner settings'));
      onData(DEFAULT_SETTINGS);
    },
  );
}

export async function saveHomeBannerVisibility(visible: boolean): Promise<void> {
  const uid = auth.currentUser?.uid ?? '';
  if (!uid) throw new Error('Sign in required');
  await setDoc(
    doc(db, SETTINGS_DOC[0], SETTINGS_DOC[1]),
    {
      visible,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    },
    { merge: true },
  );
}

export function subscribeHomeBanners(
  onData: (rows: HomeBannerDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, BANNERS_COLLECTION), orderBy('sortOrder', 'asc')),
    (snap) => {
      const rows = snap.docs.map((d) =>
        parseBanner(d.id, d.data() as Record<string, unknown>),
      );
      onData(sortBanners(rows));
    },
    (e) => {
      onError?.(e instanceof Error ? e : new Error('Failed to load banners'));
      onData([]);
    },
  );
}

/** Active banners for the Home carousel (respects sort order). */
export function subscribeActiveHomeBanners(
  onData: (rows: HomeBannerDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return subscribeHomeBanners((rows) => {
    onData(rows.filter((b) => b.active && b.imageUrl && b.headline));
  }, onError);
}

async function nextSortOrder(): Promise<number> {
  const snap = await getDocs(collection(db, BANNERS_COLLECTION));
  let max = -1;
  snap.docs.forEach((d) => {
    const raw = d.data().sortOrder;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      max = Math.max(max, Math.floor(raw));
    }
  });
  return max + 1;
}

export async function saveHomeBanner(input: {
  id?: string;
  imageUrl: string;
  badgeText?: string;
  headline: string;
  subtitle?: string;
  buttonText?: string;
  buttonDestination?: string;
  sortOrder?: number;
  active?: boolean;
}): Promise<string> {
  const uid = auth.currentUser?.uid ?? '';
  if (!uid) throw new Error('Sign in required');

  const headline = input.headline.trim();
  if (!headline) throw new Error('Headline is required');

  const imageUrl = input.imageUrl.trim();
  if (!imageUrl) throw new Error('Banner image is required');

  const id =
    input.id?.trim() ||
    `banner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const sortOrder =
    input.sortOrder != null ? Math.floor(input.sortOrder) : await nextSortOrder();

  await setDoc(
    doc(db, BANNERS_COLLECTION, id),
    {
      imageUrl,
      badgeText: (input.badgeText ?? '').trim(),
      headline,
      subtitle: (input.subtitle ?? '').trim(),
      buttonText: (input.buttonText ?? '').trim(),
      buttonDestination: (input.buttonDestination ?? '').trim(),
      sortOrder,
      active: input.active !== false,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    },
    { merge: true },
  );

  return id;
}

export async function setHomeBannerActive(
  id: string,
  active: boolean,
): Promise<void> {
  const uid = auth.currentUser?.uid ?? '';
  if (!uid) throw new Error('Sign in required');
  await setDoc(
    doc(db, BANNERS_COLLECTION, id),
    {
      active,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    },
    { merge: true },
  );
}

export async function deleteHomeBanner(id: string): Promise<void> {
  await deleteDoc(doc(db, BANNERS_COLLECTION, id));
}

export async function reorderHomeBanner(
  id: string,
  direction: 'up' | 'down',
  rows: HomeBannerDoc[],
): Promise<void> {
  const index = rows.findIndex((r) => r.id === id);
  if (index < 0) return;
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= rows.length) return;

  const current = rows[index];
  const neighbor = rows[swapIndex];
  const batch = writeBatch(db);
  batch.set(
    doc(db, BANNERS_COLLECTION, current.id),
    { sortOrder: neighbor.sortOrder, updatedAt: serverTimestamp() },
    { merge: true },
  );
  batch.set(
    doc(db, BANNERS_COLLECTION, neighbor.id),
    { sortOrder: current.sortOrder, updatedAt: serverTimestamp() },
    { merge: true },
  );
  await batch.commit();
}
