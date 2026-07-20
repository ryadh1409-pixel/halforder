import { db, storage } from '@/services/firebase';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';

export type OnboardingDisplayMode =
  | 'once'
  | 'every_launch'
  | 'every_login'
  | 'disabled';

export type OnboardingSlideAdmin = {
  id: string;
  title: string;
  subtitle: string;
  imageUri: string;
  order: number;
  enabled: boolean;
};

export type OnboardingConfig = {
  displayMode: OnboardingDisplayMode;
  slides: OnboardingSlideAdmin[];
  updatedAtMs: number | null;
};

export const ONBOARDING_CONFIG_DOC = 'appConfig/onboarding';

export const DEFAULT_ONBOARDING_SLIDES: OnboardingSlideAdmin[] = [
  {
    id: 'slide_1',
    title: 'Split meals,\npay half',
    subtitle:
      'Share a meal with someone nearby and pay only half the price on every order.',
    imageUri: '',
    order: 0,
    enabled: true,
  },
  {
    id: 'slide_2',
    title: 'Create or join\nin seconds',
    subtitle:
      'Start your own shared order or join an open one from the community.',
    imageUri: '',
    order: 1,
    enabled: true,
  },
  {
    id: 'slide_3',
    title: 'Save more,\nevery day',
    subtitle:
      'HalfOrder is free to use — split costs, try new spots, and enjoy more for less.',
    imageUri: '',
    order: 2,
    enabled: true,
  },
];

export const DEFAULT_ONBOARDING_CONFIG: OnboardingConfig = {
  displayMode: 'once',
  slides: DEFAULT_ONBOARDING_SLIDES,
  updatedAtMs: null,
};

function mapConfig(data: Record<string, unknown> | undefined): OnboardingConfig {
  if (!data) return DEFAULT_ONBOARDING_CONFIG;
  const mode = data.displayMode;
  const displayMode: OnboardingDisplayMode =
    mode === 'every_launch' ||
    mode === 'every_login' ||
    mode === 'disabled' ||
    mode === 'once'
      ? mode
      : 'once';
  const rawSlides = Array.isArray(data.slides) ? data.slides : [];
  const slides: OnboardingSlideAdmin[] =
    rawSlides.length > 0
      ? rawSlides
          .map((s, i) => {
            const row = (s ?? {}) as Record<string, unknown>;
            return {
              id:
                typeof row.id === 'string' && row.id
                  ? row.id
                  : `slide_${i + 1}`,
              title: typeof row.title === 'string' ? row.title : '',
              subtitle: typeof row.subtitle === 'string' ? row.subtitle : '',
              imageUri: typeof row.imageUri === 'string' ? row.imageUri : '',
              order: typeof row.order === 'number' ? row.order : i,
              enabled: row.enabled !== false,
            };
          })
          .sort((a, b) => a.order - b.order)
      : DEFAULT_ONBOARDING_SLIDES;
  return {
    displayMode,
    slides,
    updatedAtMs:
      data.updatedAt &&
      typeof data.updatedAt === 'object' &&
      'toMillis' in data.updatedAt
        ? (data.updatedAt as { toMillis: () => number }).toMillis()
        : null,
  };
}

export async function fetchOnboardingConfig(): Promise<OnboardingConfig> {
  const snap = await getDoc(doc(db, 'appConfig', 'onboarding'));
  return mapConfig(
    snap.exists() ? (snap.data() as Record<string, unknown>) : undefined,
  );
}

export function subscribeOnboardingConfig(
  onData: (cfg: OnboardingConfig) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'appConfig', 'onboarding'),
    (snap) => {
      onData(
        mapConfig(
          snap.exists() ? (snap.data() as Record<string, unknown>) : undefined,
        ),
      );
    },
    () => onData(DEFAULT_ONBOARDING_CONFIG),
  );
}

export async function saveOnboardingConfig(
  cfg: Omit<OnboardingConfig, 'updatedAtMs'>,
): Promise<void> {
  await setDoc(
    doc(db, 'appConfig', 'onboarding'),
    {
      displayMode: cfg.displayMode,
      slides: cfg.slides.map((s, i) => ({
        ...s,
        order: i,
      })),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Upload a slide image from a local device URI → public Storage URL. */
export async function uploadOnboardingSlideImage(
  slideId: string,
  localUri: string,
  adminUid: string,
): Promise<string> {
  const uri = localUri.trim();
  const uid = adminUid.trim();
  const sid = slideId.trim();
  if (!uri) throw new Error('No image selected.');
  if (!uid) throw new Error('Sign in required.');
  if (!sid) throw new Error('Invalid slide.');

  const res = await fetch(uri);
  const blob = await res.blob();
  const storagePath = `onboarding/${sid}/${uid}_${Date.now()}.jpg`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(storageRef);
}
