import { Alert } from 'react-native';

function formatCad(amount: number): string {
  const n = Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100;
  return `CA$${n.toFixed(2)}`;
}

/** Confirm before setting a wallet to an exact balance. */
export function confirmWalletBalanceChange(
  previousBalance: number,
  newBalance: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Confirm Balance Change',
      `You are changing this wallet balance from ${formatCad(previousBalance)} to ${formatCad(newBalance)}.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Confirm', style: 'destructive', onPress: () => resolve(true) },
      ],
    );
  });
}
