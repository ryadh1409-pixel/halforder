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
