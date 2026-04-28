# OurFood / HalfOrder — Admin Web Dashboard

Production-style admin UI (Next.js + Firebase + Tailwind + Recharts) for the same Firestore project as the Expo app.

## Run locally

```bash
cd admin-dashboard
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You are redirected to `/login` or `/dashboard`.

## Admin login

1. In **Firebase Console → Authentication**, enable **Email/Password** (if not already).
2. Create a user with email **`admin@ourfood.com`** (must match `lib/admin-constants.ts` and your Firestore/Storage `isAdmin()` rules).
3. Sign in on `/login` with that email and password.

Only `admin@ourfood.com` is accepted; any other email is rejected before Firebase sign-in.

## Where data comes from

| Page       | Firestore         | Updates      |
| ---------- | ----------------- | ------------ |
| Dashboard  | `users`, `orders` | `onSnapshot` |
| Food Cards | `foodTemplates`   | `onSnapshot` |
| Orders     | `orders`          | `onSnapshot` |
| Users      | `users`           | `onSnapshot` |

Firebase config lives in **`lib/firebase.ts`** and matches the mobile app project (`halforfer`).

## Metrics (Dashboard)

- **Total users** — Count of documents in `users`.
- **Total orders** — Count of documents in `orders`.
- **Active orders** — Orders whose `status` is not terminal (`completed`, `cancelled`, `expired`) and is treated as in-flight (aligned with admin mobile helpers: e.g. `waiting`, `matched`, `active`, …).
- **Orders today** — Orders whose `createdAt` falls on or after local midnight (browser timezone).

Charts bucket by **UTC calendar day** for the last 14 days:

- **Orders per day** — from each order’s `createdAt`.
- **New users per day** — from each user profile’s `createdAt`.

## Food templates

CRUD aligns with the mobile app: max **10** documents in `foodTemplates`, fields `name`, `description`, `price`, `imageUrl`, `active`, `createdAt`. Images can be uploaded to the same Storage path prefix `foodTemplates/` (admin rules must allow your signed-in admin).

## Build

```bash
npm run build
npm start
```

Deploy to Vercel or any Node host; set no extra env vars if you keep config in `lib/firebase.ts` (or move to env for production hardening).
