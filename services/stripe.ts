import {
  initPaymentSheet,
  presentPaymentSheet,
} from "@stripe/stripe-react-native";
import { httpsCallable } from "firebase/functions";
import { Platform } from "react-native";
import { auth, functions } from "./firebase";

const SIGN_IN_REQUIRED_ERROR = "Please sign in to complete payment";

function assertNonAnonymousPaymentUser(): void {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.isAnonymous) {
    if (currentUser?.isAnonymous) {
      void auth.signOut();
    }
    throw new Error(SIGN_IN_REQUIRED_ERROR);
  }
}

export const createPaymentIntent = async (amount: number) => {
  assertNonAnonymousPaymentUser();
  const fn = httpsCallable(functions, "createPaymentIntent");
  const res: any = await fn({ amount });
  return res.data;
};

export const startStripeOnboarding = async () => {
  assertNonAnonymousPaymentUser();
  const fn = httpsCallable(functions, "startRestaurantStripeConnect");
  const res: any = await fn();
  return res.data;
};

type InitSheetParams = {
  amount: number;
  merchantDisplayName?: string;
  orderId?: string;
};

type InitSheetResult = {
  clientSecret: string;
  paymentIntentId: string;
};

function parsePaymentIntentId(clientSecret: string): string {
  const idx = clientSecret.indexOf("_secret_");
  return idx > 0 ? clientSecret.slice(0, idx) : clientSecret;
}

export const initializePaymentSheet = async (
  params: InitSheetParams,
): Promise<InitSheetResult> => {
  const amount = Number(params.amount);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Amount must be a positive integer (in cents).");
  }
  if (Platform.OS === "web") {
    throw new Error("PaymentSheet is not supported on web.");
  }

  assertNonAnonymousPaymentUser();

  console.log(
    "[stripe] auth.currentUser.uid",
    auth.currentUser?.uid ?? null,
  );
  console.log(
    "[stripe] auth.currentUser.isAnonymous",
    auth.currentUser?.isAnonymous ?? null,
  );

  await auth.currentUser?.getIdToken(true);

  const fn = httpsCallable(functions, "createPaymentIntent");
  const result = await fn({
    amount,
    orderId: params.orderId ?? null,
  });

  console.log(
    "[stripe] callable response",
    JSON.stringify(result.data ?? null),
  );

  const data = result.data as Record<string, unknown> | undefined;
  const clientSecret =
    typeof data?.clientSecret === "string"
      ? data.clientSecret
      : typeof data?.client_secret === "string"
        ? data.client_secret
        : undefined;

  console.log("clientSecret value:", clientSecret);
  if (!clientSecret) throw new Error("clientSecret missing");
  const { error } = await initPaymentSheet({
    paymentIntentClientSecret: clientSecret,
    merchantDisplayName: "Halforder",
  });
  if (error) throw new Error("initPaymentSheet failed: " + error.message);

  return {
    clientSecret,
    paymentIntentId: parsePaymentIntentId(clientSecret),
  };
};

export const openPaymentSheet = async (params: InitSheetParams) => {
  assertNonAnonymousPaymentUser();
  const init = await initializePaymentSheet(params);
  const { error } = await presentPaymentSheet();
  if (error) {
    if (error.code === "Canceled") {
      return { status: "canceled" as const, ...init };
    }
    return {
      status: "failed" as const,
      message: error.message || "Payment failed.",
      ...init,
    };
  }
  return { status: "success" as const, ...init };
};
