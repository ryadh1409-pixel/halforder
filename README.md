# HalfOrder (Expo)

Native-first delivery app built with **Expo Router**, **Firebase**, and **EAS**.

## Why not Expo Go?

This project uses **custom native code** (`@stripe/stripe-react-native`, `react-native-maps`, full push setup, etc.). **Expo Go** cannot load that surface. Use a **development build** (`expo-dev-client`) or a store/production binary. If you open the project in Expo Go, the app shows a blocking screen explaining this.

## Prerequisites

- Node 20+ recommended  
- [EAS CLI](https://docs.expo.dev/build/setup/) (`npm i -g eas-cli`) and an Expo account  
- Xcode (iOS) / Android Studio (Android) for `expo run:*` when working locally

## Install

```bash
npm install
```

## Daily development (Dev Client + Metro)

1. **Create or install a development build** (one-time per machine / when native deps change):

   ```bash
   eas build --profile development --platform ios
   # or Android:
   eas build --profile development --platform android
   ```

   Install the resulting artifact on a simulator or device (EAS dashboard → Install).

2. **Start Metro for the dev client** (not Expo Go):

   ```bash
   npm start
   # same as:
   npx expo start --dev-client
   ```

   Or:

   ```bash
   npm run dev
   ```

3. Open the **HalfOrder development** app on the simulator/device; it will connect to this Metro server.

## Run native locally (optional)

```bash
npm run ios
npm run android
```

These use `expo run:ios` / `expo run:android` to compile and launch the dev client from your machine.

## Web

```bash
npm run web
```

Web uses static export where configured; native-only modules are stubbed or gated on web.

## EAS profiles

| Profile        | Purpose                                      |
|----------------|----------------------------------------------|
| `development` | Dev client, internal distribution, iOS sim   |
| `preview`     | Internal / QA builds                         |
| `production`  | Store releases (`autoIncrement` on iOS)    |

```bash
eas build --profile development --platform ios
eas build --profile preview --platform all
eas build --profile production --platform all
```

## App identifiers

- **iOS bundle ID:** `com.halforder.app` (`app.json` → `expo.ios.bundleIdentifier`)  
- **Android package:** `com.anonymous.ourfoodclean` (`app.json` → `expo.android.package`) — align with iOS when ready for Play Console.  
- **URL scheme:** `halforder` (deep links + Stripe return URL)

## Stripe webhook testing

Implementation: **`stripe-backend`** → **`stripeWebhook`** (Firebase Functions v2 `onRequest`). Full setup: **`stripe-backend/WEBHOOK.md`**.

Quick checks:

1. [Stripe CLI](https://stripe.com/docs/stripe-cli): `stripe login`
2. Forward: `stripe listen --forward-to http://127.0.0.1:5001/halforfer/us-central1/stripeWebhook` (adjust project/region)
3. `npm run test:webhook`
4. Logs: Firebase console → Functions → `stripeWebhook`

## Learn more

- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
