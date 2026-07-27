import { functions } from '@/services/firebase';
import type {
  CompleteMealCampaignPublic,
  CompleteMealOrderDraft,
} from '@/types/completeMeal';
import { httpsCallable } from 'firebase/functions';

export async function createCompleteMealCampaign(input: {
  orderDraft: CompleteMealOrderDraft;
  ownerPayCents: number;
  ownerFirstName?: string;
}): Promise<{
  campaignId: string;
  shareToken: string;
  ownerPayCents: number;
  remainingCents: number;
}> {
  const fn = httpsCallable(functions, 'createCompleteMealCampaign');
  const res = await fn(input);
  return res.data as {
    campaignId: string;
    shareToken: string;
    ownerPayCents: number;
    remainingCents: number;
  };
}

export async function getCompleteMealCampaign(input: {
  campaignId?: string;
  shareToken?: string;
}): Promise<CompleteMealCampaignPublic> {
  const fn = httpsCallable(functions, 'getCompleteMealCampaign');
  const res = await fn(input);
  return res.data as CompleteMealCampaignPublic;
}

export async function cancelCompleteMealCampaign(
  campaignId: string,
): Promise<void> {
  const fn = httpsCallable(functions, 'cancelCompleteMealCampaign');
  await fn({ campaignId });
}

export async function createCompleteMealPaymentIntent(input: {
  campaignId: string;
  amountCents: number;
}): Promise<{
  clientSecret: string;
  paymentIntentId: string;
  customerId: string;
  ephemeralKey: string | null;
  amountCents: number;
}> {
  const fn = httpsCallable(functions, 'createCompleteMealPaymentIntent');
  const res = await fn(input);
  return res.data as {
    clientSecret: string;
    paymentIntentId: string;
    customerId: string;
    ephemeralKey: string | null;
    amountCents: number;
  };
}

export async function confirmCompleteMealPayment(input: {
  campaignId: string;
  paymentIntentId: string;
}): Promise<{
  ok: true;
  campaignId: string;
  remainingCents: number;
  funded: boolean;
  orderId: string | null;
}> {
  const fn = httpsCallable(functions, 'confirmCompleteMealPayment');
  const res = await fn(input);
  return res.data as {
    ok: true;
    campaignId: string;
    remainingCents: number;
    funded: boolean;
    orderId: string | null;
  };
}
