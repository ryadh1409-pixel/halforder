/**
 * Runtime host detection for Expo.
 *
 * **Expo Go is not supported** for this app: native modules (`@stripe/stripe-react-native`,
 * `react-native-maps`, full `expo-notifications`, etc.) require a **development build**
 * (`expo-dev-client`) or a production store build. Expo Go uses a generic client binary that
 * omits or sandboxes many native dependencies — use `eas build --profile development` and
 * `npx expo start --dev-client` instead.
 */
import Constants, { AppOwnership, ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

const isNativeMobile = Platform.OS === 'ios' || Platform.OS === 'android';

/** True when running inside the Expo Go store client (not a dev client / standalone binary). */
export const isExpoGo: boolean =
  isNativeMobile &&
  (Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Constants.appOwnership === AppOwnership.Expo);

/** True for dev client, standalone, or bare — anything except Expo Go on native. */
export const isNativeDevClientOrStandalone: boolean = isNativeMobile && !isExpoGo;

/** Stripe / full maps / push token sync — disable in Expo Go to avoid native crashes or unsupported APIs. */
export const isNativePaymentsAndMapsSupported: boolean = isNativeDevClientOrStandalone;
