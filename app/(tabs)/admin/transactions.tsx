import { Redirect } from 'expo-router';

/** Transactions view is the Payments table — redirect for Finance nav consistency. */
export default function AdminTransactionsScreen() {
  return <Redirect href="/(tabs)/admin/payments" />;
}
