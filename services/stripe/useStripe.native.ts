import { useStripe as useNativeStripe } from '@stripe/stripe-react-native';

export function useStripeWrapper() {
  return useNativeStripe();
}
