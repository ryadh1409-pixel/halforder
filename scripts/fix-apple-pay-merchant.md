# Apple Pay merchant ID fix (TestFlight / EAS)

## Correct values (must match everywhere)

| Setting | Value |
|--------|--------|
| iOS bundle ID | `com.halforder.app` |
| Apple Pay merchant ID | `merchant.com.halforder.app` |

**Wrong (typo — remove from Apple Developer):** `merchant.com.halforfer`

## Repo config (already aligned)

- `app.json` → `ios.bundleIdentifier`, `ios.entitlements`, `@stripe/stripe-react-native` plugin `merchantIdentifier`
- `app/_layout.tsx` → `AppStripeProvider` uses `constants/applePay.ts`
- No `merchant.com.halforfer` in source — typo lives in **Apple Developer** / **stale EAS provisioning profile**

## Apple Developer portal

1. [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources)
2. **Identifiers** → App ID `com.halforder.app` → **Capabilities** → **Apple Pay**
3. Enable Apple Pay and select **only** merchant ID: `merchant.com.halforder.app`
4. Remove / uncheck `merchant.com.halforfer` if listed
5. **Identifiers** → **Merchant IDs** → create `merchant.com.halforder.app` if missing
6. **Profiles** → delete old Distribution profiles for `com.halforder.app` (optional; EAS can regenerate)

## Stripe Dashboard

**Settings → Payment methods → Apple Pay** → add iOS application:

- Bundle ID: `com.halforder.app`
- Merchant ID: `merchant.com.halforder.app`

## Regenerate EAS iOS credentials

Interactive (recommended once):

```bash
npx eas credentials --platform ios
```

- Select **production** (or the profile you build with)
- **Provisioning Profile** → **Remove** / delete invalid profile
- **Apple Pay** / capabilities → ensure merchant is `merchant.com.halforder.app`
- Let EAS create a new Distribution certificate + profile

Or clear on next build:

```bash
npx eas build --platform ios --profile production --clear-credentials
```

## Production build + TestFlight

```bash
npx eas build --platform ios --profile production --auto-submit
```

Verify build logs show entitlements include `com.apple.developer.in-app-payments` → `merchant.com.halforder.app`.
