import { httpsCallable } from "firebase/functions";
import { Linking } from "react-native";
import { functions } from "./firebase";

// Create payment intent
export const createPaymentIntent = async (amount: number) => {
  const fn = httpsCallable(functions, "createPaymentIntent");
  const res: any = await fn({ amount });
  return res.data;
};

// Start Stripe onboarding for hosts
export const startStripeOnboarding = async () => {
  const fn = httpsCallable(functions, "startRestaurantStripeConnect");
  const res: any = await fn();
  const url = res?.data?.url;
  if (typeof url === "string" && url.startsWith("http")) {
    await Linking.openURL(url);
  }
  return res.data;
};
