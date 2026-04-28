# HalfOrder — Full Codebase Fix Prompt for Cursor

You are working on **HalfOrder**, a React Native / Expo app for sharing food orders and delivery costs in Toronto. The tech stack is: Expo Router 6, React Native 0.81, Firebase (Firestore + Auth + Storage), TypeScript strict mode, and Jest for testing.

Please apply **all** of the following fixes in one pass. Work through them in order. Do not skip any section.

---

## 1. Fix Android Package Name

**File:** `app.json`

Change the Android package from `com.anonymous.ourfoodclean` to `com.halforder.app` so it matches the iOS bundle ID and is ready for Play Store submission.

```json
// Before
"package": "com.anonymous.ourfoodclean"

// After
"package": "com.halforder.app"
```

---

## 2. Refactor `app/_layout.tsx` (1157 lines → split into focused hooks)

The root layout file is 1157 lines and handles too many concerns. Extract each concern into its own custom hook inside a new `hooks/layout/` directory, then import them back into `_layout.tsx`.

### 2a. Create `hooks/layout/useTidioChat.ts`

Extract all Tidio live chat initialization logic (web script injection, visitor identification, Tidio API calls) from `_layout.tsx` into this hook.

### 2b. Create `hooks/layout/useNotificationSetup.ts`

Extract all Expo push notification setup logic: permission requests, token registration, `addNotificationReceivedListener`, `addNotificationResponseReceivedListener`, and deep-link navigation on response.

### 2c. Create `hooks/layout/useAuthRedirect.ts`

Extract the auth state listener and all redirect logic (unauthenticated → `/login`, unverified → `/verify-email`, terms not accepted → `/terms`, etc.) into this hook. It should return nothing — just handle navigation as a side effect.

### 2d. Create `hooks/layout/useOrderCleanup.ts`

Extract the periodic order expiry / cleanup logic (the interval or timeout that cancels expired orders) into this hook.

### 2e. Create `hooks/layout/useAnalyticsSetup.ts`

Extract analytics initialization and screen-tracking logic into this hook.

### 2f. Update `app/_layout.tsx`

After extracting the above, `_layout.tsx` should only:

- Import and call the five hooks above
- Define the `<Stack>` / `<Slot>` navigator structure
- Wrap children with necessary providers (AuthProvider, ThemeProvider, etc.)

Target: **under 150 lines**.

---

## 3. Remove Duplicate Service Files

### 3a. Audit block services

There are three files that overlap: `services/block.ts`, `services/blocks.ts`, and `services/blockService.ts`.

- Read all three files.
- Identify which one is the most complete and up-to-date.
- Merge any unique logic from the others into the canonical file (`services/blockService.ts` — use this as the single source of truth).
- Delete `services/block.ts` and `services/blocks.ts`.
- Update all imports across the codebase to point to `services/blockService.ts`.

---

## 4. Consolidate Error Handling Utilities

There are three overlapping error utilities: `utils/errorHandler.ts`, `utils/errorLogger.ts`, and `utils/friendlyError.ts`.

- Read all three files.
- Create a single unified file: `utils/errors.ts` that exports:
  - `logError(error, context?)` — logs to console (and optionally to Firebase/Crashlytics)
  - `getFriendlyMessage(error)` — returns a human-readable string
  - `handleError(error, context?)` — calls both above + shows a toast
- Delete the three old files.
- Update all imports across the codebase.

---

## 5. Consolidate Admin Interfaces

There are **three** separate admin implementations: `app/admin/` (in-app screens), `admin-dashboard/` (Next.js), and `admin/` (another Next.js build). This creates confusion and maintenance overhead.

- Add a comment block at the top of each admin entry point (`admin-dashboard/` and `admin/`) explaining their purpose vs. the in-app admin.
- Create a `ADMIN_ARCHITECTURE.md` file at the project root that documents:
  - Which admin interface is the primary one
  - Which is deprecated / legacy
  - Steps to fully migrate to the primary one (leave as TODOs if not all can be done now)
- If either `admin-dashboard/` or `admin/` is clearly a duplicate of the other, delete the older/less complete one.

---

## 6. Add Environment Configuration

Currently the app has no environment separation. Fix this:

### 6a. Create `.env.example`

```
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_OPENAI_API_KEY=
EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=
EXPO_PUBLIC_RADAR_API_KEY=
EXPO_PUBLIC_ENV=development
```

### 6b. Update `services/firebase.ts`

Replace any hardcoded Firebase config values with `process.env.EXPO_PUBLIC_FIREBASE_*` variables, with a clear comment that `.env` must be configured locally.

### 6c. Create `eas.json` environment channels (if not already present)

Add `development`, `preview`, and `production` build profiles with appropriate environment variable handling.

### 6d. Add `.env` to `.gitignore`

Make sure `.env` (but not `.env.example`) is in `.gitignore`.

---

## 7. Fix TypeScript Type Centralization

Currently types are scattered — some in `types/food.ts`, some inlined in service files.

- Create the following files if they don't already exist, and move the relevant types into them:
  - `types/order.ts` — all Order-related interfaces and enums
  - `types/user.ts` — all User/Profile-related interfaces
  - `types/chat.ts` — all Chat/Message-related interfaces
  - `types/notification.ts` — all push notification payload types
- Update all imports across the codebase.
- Do NOT move types that are only used in a single file — only move types used in 2+ files.

---

## 8. Fix Android Build Configuration

In `app.json`, also verify and fix:

- `"googleServicesFile": "./google-services.json"` is present under `android` (required for Firebase on Android)
- `"googleServicesFile": "./GoogleService-Info.plist"` is present under `ios` (required for Firebase on iOS)
- If these keys are missing, add them with the correct paths.

---

## 9. Improve Test Coverage (Skeleton Tests)

Add skeleton test files for the most critical services so the structure is in place for future tests:

- `tests/services/blockService.test.ts` — test block/unblock/isBlocked logic
- `tests/services/orders.test.ts` — test order creation, joining, lifecycle
- `tests/services/auth.test.ts` — test email/phone sign-in flows
- `tests/hooks/useAuthRedirect.test.ts` — test redirect logic

Each test file should have:

- At least 3 `it('should ...')` blocks with `expect` stubs (marked `// TODO: implement`)
- Proper imports and mock setup for Firebase

---

## 10. Code Style Cleanup

- Run ESLint auto-fix across the entire project: `npx eslint . --fix`
- Run Prettier across the entire project: `npx prettier --write .`
- Fix any remaining ESLint errors that cannot be auto-fixed (unused imports, missing deps in useEffect, etc.)

---

## 11. Add a Root `CLAUDE.md` (Project Context File)

Create `CLAUDE.md` at the project root to document the codebase for AI assistants. Include:

```markdown
# HalfOrder — Project Context

## What this app does

HalfOrder lets users in Toronto split food orders and share delivery costs. Users swipe through active food orders, join a match, coordinate via chat, and split the bill.

## Tech Stack

- Expo 54 / React Native 0.81 / Expo Router 6
- Firebase: Firestore (DB), Auth, Storage
- TypeScript strict mode
- Jest for testing

## Key Directories

- `app/` — all screens (Expo Router file-based routing)
- `services/` — all Firebase + API logic (73 files)
- `hooks/` — custom React hooks
- `components/` — reusable UI components
- `constants/` — app-wide constants and theme
- `types/` — shared TypeScript interfaces
- `utils/` — helpers (errors, toast, moderation)
- `tests/` — Jest test suites
- `admin/` / `admin-dashboard/` — web-based admin panels (Next.js)

## Auth Flow

Unauthenticated → Login → Email Verify → Terms Accept → Main App

## Order Lifecycle

pending → matched → in_progress → completed / cancelled

## Admin Access

Controlled via `constants/adminUid.ts` — hardcoded UIDs (TODO: move to Firestore role)

## Environment

Copy `.env.example` → `.env` and fill in all keys before running locally.
```

---

## After All Changes

1. Run `npx tsc --noEmit` and fix any TypeScript errors introduced.
2. Run `npx jest` and fix any broken tests.
3. Run `npx expo start` and verify the app boots without errors.
4. Confirm `_layout.tsx` is under 150 lines.
5. Confirm there is only one `block` service file remaining.
6. Confirm there is only one `error` utility file remaining.
