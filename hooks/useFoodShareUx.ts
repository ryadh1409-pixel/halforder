import {
  FOOD_SHARE_LIFECYCLE_ALERTS,
  resolveFoodShareLifecycleAlertKey,
  type FoodShareLifecycleAlertKey,
} from '@/lib/foodShareUx';
import { hapticOrderStatusChange } from '@/lib/foodShareHaptics';
import type { FoodShareMatchDoc } from '@/types/foodShare';
import { showNotice, showSuccess } from '@/utils/toast';
import { systemConfirm } from '@/components/SystemDialogHost';
import { useEffect, useRef } from 'react';

function showLifecycleToast(key: FoodShareLifecycleAlertKey): void {
  const copy = FOOD_SHARE_LIFECYCLE_ALERTS[key];
  if (key === 'completed') {
    showSuccess(copy.message);
  } else if (key === 'cancelled') {
    showNotice(copy.title, copy.message);
  } else {
    showNotice(copy.title, copy.message);
  }
  hapticOrderStatusChange();
}

export function useFoodShareMatchLifecycleAlerts(
  match: FoodShareMatchDoc | null,
): void {
  const lastKeyRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!match) return;
    const key = resolveFoodShareLifecycleAlertKey(
      match.lifecycle,
      match.deliveryStatus,
    );
    if (!key) return;

    const signature = `${match.id}:${key}:${match.orderStatus ?? ''}:${match.deliveryStatus ?? ''}`;
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastKeyRef.current = signature;
      return;
    }
    if (lastKeyRef.current === signature) return;
    lastKeyRef.current = signature;

    showLifecycleToast(key);
  }, [
    match?.id,
    match?.lifecycle,
    match?.orderStatus,
    match?.deliveryStatus,
  ]);
}

export async function confirmJoinShare(foodName: string): Promise<boolean> {
  return systemConfirm({
    title: 'Join this meal share?',
    message: `Swipe right to join "${foodName}" and wait for another user to match.`,
    confirmLabel: 'Join share',
    cancelLabel: 'Not now',
  });
}

export async function confirmCancelMatch(foodName: string): Promise<boolean> {
  return systemConfirm({
    title: 'Cancel match?',
    message: `This ends your meal share for ${foodName}.`,
    confirmLabel: 'Cancel match',
    cancelLabel: 'Keep match',
    destructive: true,
  });
}

export async function confirmLeaveChat(): Promise<boolean> {
  return systemConfirm({
    title: 'Leave chat?',
    message: 'You can return anytime from your match details.',
    confirmLabel: 'Leave',
    cancelLabel: 'Stay',
  });
}

export async function confirmBlockUser(firstName: string): Promise<boolean> {
  return systemConfirm({
    title: 'Block user?',
    message: `Block ${firstName}? You won't be matched together again.`,
    confirmLabel: 'Block',
    cancelLabel: 'Cancel',
    destructive: true,
  });
}
