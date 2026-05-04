# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Stripe webhook testing

Cloud Function: `stripeWebhook` (uses `req.rawBody` + `stripe.webhooks.constructEvent` for signature verification).

1. Install the [Stripe CLI](https://stripe.com/docs/stripe-cli) and log in:

   ```bash
   stripe login
   ```

2. **Local (Firebase emulator)** — start emulators, then forward events (replace `YOUR_PROJECT` with your Firebase project id, e.g. `halforfer`):

   ```bash
   firebase emulators:start --only functions
   ```

   In another terminal:

   ```bash
   stripe listen --forward-to http://127.0.0.1:5001/YOUR_PROJECT/us-central1/stripeWebhook
   ```

   Copy the webhook signing secret (`whsec_...`) printed by `stripe listen` and set **`STRIPE_WEBHOOK_SECRET`** for the Functions emulator so `constructEvent` can verify signatures.

3. **Production** — register the HTTPS URL in the [Stripe Dashboard](https://dashboard.stripe.com/webhooks) and set **`STRIPE_WEBHOOK_SECRET`** on the deployed function (Firebase/GCP environment).

4. Trigger a test event (with `stripe listen` running so Stripe can deliver the event):

   ```bash
   npm run test:webhook
   ```

5. Confirm in **Firebase → Functions → Logs**: lines like `🔥 Stripe webhook received:` and, for real order metadata, `✅ Order marked as PAID:`.

## Stripe Webhook Setup (ONE TIME)

1. Go to Stripe Dashboard
2. Developers → Webhooks
3. Click "Add endpoint"
4. Paste this URL:

https://us-central1-halforfer.cloudfunctions.net/stripeWebhook

5. Select event:
payment_intent.succeeded

6. Save

Done ✅
