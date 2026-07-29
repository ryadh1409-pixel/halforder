import { functions } from '@/services/firebase';
import type {
  CashbackRewardsAdminDashboard,
  CashbackWallet,
  SaveCashbackRewardsSettings,
} from '@/types/cashbackRewards';
import { httpsCallable } from 'firebase/functions';

export async function getCashbackWallet(): Promise<CashbackWallet> {
  const callable = httpsCallable<Record<string, never>, CashbackWallet>(
    functions,
    'getCashbackWallet',
  );
  const result = await callable({});
  return result.data;
}

export async function getAdminCashbackRewards(): Promise<CashbackRewardsAdminDashboard> {
  const callable = httpsCallable<
    Record<string, never>,
    CashbackRewardsAdminDashboard
  >(functions, 'getAdminCashbackRewards');
  const result = await callable({});
  return result.data;
}

export async function saveAdminCashbackRewards(
  settings: SaveCashbackRewardsSettings,
): Promise<void> {
  const callable = httpsCallable<SaveCashbackRewardsSettings, { ok: boolean }>(
    functions,
    'saveAdminCashbackRewards',
  );
  await callable(settings);
}
