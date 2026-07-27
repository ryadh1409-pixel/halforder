import type { CompleteMealOrderDraft } from '@/types/completeMeal';

let pendingDraft: CompleteMealOrderDraft | null = null;

export function setPendingCompleteMealDraft(draft: CompleteMealOrderDraft): void {
  pendingDraft = draft;
}

export function peekPendingCompleteMealDraft(): CompleteMealOrderDraft | null {
  return pendingDraft;
}

export function clearPendingCompleteMealDraft(): void {
  pendingDraft = null;
}
