/**
 * Guided support intake helpers (Emo AI greeting, device info, orders, tickets).
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { Platform } from 'react-native';

import { db } from '@/services/firebase';
import type {
  SupportDeviceInfo,
  SupportIssueCategoryId,
} from '@/types/supportIntake';
import { supportCategoryById } from '@/types/supportIntake';

export type SupportOrderOption = {
  id: string;
  label: string;
  status: string;
  createdAtMs: number | null;
};

export function firstNameFromDisplayName(
  displayName: string | null | undefined,
): string {
  const raw = (displayName ?? '').trim();
  if (!raw) return 'there';
  const first = raw.split(/\s+/).filter(Boolean)[0];
  return first || 'there';
}

export function buildEmoSupportGreeting(firstName: string): string {
  const name = firstName.trim() || 'there';
  return [
    `Hello ${name} 👋`,
    '',
    'Welcome to HalfOrder Support.',
    '',
    "I'm Emo AI and I'll help you submit your request.",
    '',
    'Please choose what you need help with.',
  ].join('\n');
}

export function buildEmoSupportConfirmation(referenceNumber: string): string {
  return [
    'Thank you for the information.',
    '',
    'Your support request has been created successfully.',
    '',
    `Reference Number:`,
    referenceNumber,
    '',
    'Our HalfOrder Support Team will review your request.',
    '',
    'Typical response time:',
    'Less than 24 hours.',
    '',
    'You can continue chatting here and upload more information if needed.',
    '',
    'Thank you for using HalfOrder.',
  ].join('\n');
}

export function buildEmoStepPrompt(
  categoryId: SupportIssueCategoryId,
  step: string,
): string {
  const cat = supportCategoryById(categoryId);
  switch (step) {
    case 'select_order':
      return `Got it — ${cat.label}. Which order is this about? Select one below, or skip if it isn’t tied to an order.`;
    case 'upload_images':
      if (categoryId === 'report_user') {
        return 'Please upload screenshots of the conversation. You can add multiple photos.';
      }
      if (categoryId === 'payment_issue' || categoryId === 'refund_request') {
        return 'Please upload a payment screenshot or receipt. You can add more than one.';
      }
      if (categoryId === 'delivery_problem') {
        return 'Please upload a delivery photo if you have one.';
      }
      if (categoryId === 'driver_issue') {
        return 'Please upload any evidence you have (photos or screenshots).';
      }
      if (categoryId === 'technical_problem') {
        return 'Please upload a screenshot of what went wrong.';
      }
      return 'If you have photos or screenshots, please upload them now. You can add several.';
    case 'payment_amount':
      return 'What was the payment amount?';
    case 'payment_date':
      return 'What was the payment date?';
    case 'order_number_optional':
      return 'Do you have an order number? You can type it or skip.';
    case 'description':
      if (categoryId === 'refund_request') {
        return 'Please describe why you’d like a refund.';
      }
      if (categoryId === 'technical_problem') {
        return 'Please describe what happened. We’ll also collect basic device details automatically.';
      }
      return 'Please add any additional details that will help our team.';
    case 'review':
      return 'Almost done. Review your request and tap Submit when you’re ready.';
    default:
      return 'How can we help?';
  }
}

/** HD-###### style reference (6 digits). */
export function generateSupportReferenceNumber(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `HD-${n}`;
}

export function collectSupportDeviceInfo(): SupportDeviceInfo {
  const appVersion =
    Constants.expoConfig?.version ??
    Constants.nativeAppVersion ??
    null;
  return {
    platform: Platform.OS,
    osVersion: Device.osVersion ?? Platform.Version?.toString?.() ?? null,
    modelName: Device.modelName ?? null,
    appVersion: typeof appVersion === 'string' ? appVersion : null,
  };
}

function orderLabel(id: string, data: Record<string, unknown>): string {
  const restaurant =
    (typeof data.restaurantName === 'string' && data.restaurantName) ||
    (typeof data.storeName === 'string' && data.storeName) ||
    null;
  const status =
    typeof data.status === 'string' ? data.status.replace(/_/g, ' ') : 'order';
  const shortId = id.length > 8 ? `${id.slice(0, 8)}…` : id;
  return restaurant ? `${restaurant} · ${shortId}` : `${status} · ${shortId}`;
}

export async function fetchRecentOrdersForSupport(
  uid: string,
  max = 12,
): Promise<SupportOrderOption[]> {
  const userId = uid.trim();
  if (!userId) return [];

  const mapSnap = (
    snap: Awaited<ReturnType<typeof getDocs>>,
  ): SupportOrderOption[] =>
    snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const createdAt = data.createdAt as { toMillis?: () => number } | number | undefined;
      let createdAtMs: number | null = null;
      if (createdAt && typeof createdAt === 'object' && typeof createdAt.toMillis === 'function') {
        createdAtMs = createdAt.toMillis();
      } else if (typeof createdAt === 'number') {
        createdAtMs = createdAt;
      }
      return {
        id: d.id,
        label: orderLabel(d.id, data),
        status: typeof data.status === 'string' ? data.status : 'unknown',
        createdAtMs,
      };
    });

  try {
    const snap = await getDocs(
      query(
        collection(db, 'orders'),
        where('customerId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(max),
      ),
    );
    if (!snap.empty) return mapSnap(snap);
  } catch {
    /* index / field may differ */
  }

  try {
    const snap = await getDocs(
      query(
        collection(db, 'orders'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(max),
      ),
    );
    return mapSnap(snap);
  } catch {
    return [];
  }
}
