/**
 * Base URL for the Node Stripe backend (same Wi‑Fi as the phone).
 *
 * - Set `EXPO_PUBLIC_STRIPE_API_URL` in the project root `.env` (recommended).
 * - Or edit `LAN_FALLBACK` below to match your machine (e.g. from backend startup logs).
 *
 * Set `EXPO_PUBLIC_STRIPE_HTTP_DISABLED=1` to use Firebase callables instead (no local server).
 */
const LAN_FALLBACK = 'http://192.168.0.41:3000';

const fromEnv = process.env.EXPO_PUBLIC_STRIPE_API_URL?.trim().replace(/\/$/, '') ?? '';

export const STRIPE_HTTP_ENABLED = process.env.EXPO_PUBLIC_STRIPE_HTTP_DISABLED !== '1';

export const API_BASE_URL = (fromEnv || LAN_FALLBACK).replace(/\/$/, '');
