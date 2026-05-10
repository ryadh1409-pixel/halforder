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

Implementation: **`stripe-backend`** codebase → **`stripeWebhook`** (Firebase Functions **v2** `onRequest`). Verification uses **`req.rawBody`** only — no `express.json()` on this route.

Full setup (secrets, redeploy, local Stripe CLI, event types): see **`stripe-backend/WEBHOOK.md`**.

Quick checks:

1. Install the [Stripe CLI](https://stripe.com/docs/stripe-cli) and log in: `stripe login`
2. Emulator forward URL (replace project id if needed):

   `stripe listen --forward-to http://127.0.0.1:5001/halforfer/us-central1/stripeWebhook`

3. Trigger test: `npm run test:webhook`
4. Logs: `[stripeWebhook]` entries in Firebase Functions logs.

## Stripe Webhook Setup (ONE TIME)

1. Stripe Dashboard → Developers → Webhooks → Add endpoint  
   URL: `https://us-central1-halforfer.cloudfunctions.net/stripeWebhook`
2. Events: at minimum `payment_intent.succeeded`; add `checkout.session.completed` if you use Checkout.
3. Copy the endpoint signing secret into Firebase Secret **`STRIPE_WEBHOOK_SECRET`** (`firebase functions:secrets:set`), then redeploy — see **`stripe-backend/WEBHOOK.md`**.
