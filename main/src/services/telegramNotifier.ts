/**
 * Centralized admin notification service — Telegram channel.
 *
 * ┌─ USAGE ──────────────────────────────────────────────────────────────────┐
 * │                                                                          │
 * │  import {                                                                │
 * │    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,                                 │
 * │    buildFields, sendTelegramNotification,                                │
 * │  } from "./services/telegramNotifier.js";                                │
 * │                                                                          │
 * │  export const myFn = onDocumentCreated(                                  │
 * │    { document: "col/{id}", secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID] },
 * │    async (event) => {                                                    │
 * │      await sendTelegramNotification({                                    │
 * │        emoji: "🍔", title: "New HalfOrder",                             │
 * │        message: buildFields([["Customer", name], ["Total", "CA$28.40"]]),│
 * │        priority: "info",                                                 │
 * │      });                                                                 │
 * │    },                                                                    │
 * │  );                                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ EXTENDING ──────────────────────────────────────────────────────────────┐
 * │ To add Discord, Slack, or Email:                                         │
 * │   1. Implement NotificationProvider below.                               │
 * │   2. defineSecret() for the new provider's credentials.                  │
 * │   3. Push an instance into the `providers` array at the bottom.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ FUTURE NOTIFICATION SITES ──────────────────────────────────────────────┐
 * │  Add sendTelegramNotification() calls at these points as the app grows:  │
 * │  • New user registered          (syncUserRoleClaims.ts)                  │
 * │  • HalfOrder matched            (adminNotifications.ts)                  │
 * │  • Payment succeeded / failed   (adminNotifications.ts)                  │
 * │  • Refund / chargeback          (adminNotifications.ts)                  │
 * │  • Driver assigned / arrived    (driverReadyForPickupNotifications.ts)    │
 * │  • Order completed              (orderRetentionCleanup.ts)               │
 * │  • Report submitted             (adminNotifications.ts)                  │
 * │  • High-risk moderation event   (adminNotifications.ts)                  │
 * │  • Cloud Function error         (any catch block)                        │
 * │  • Stripe webhook error         (serverOrderWrite.ts)                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

import axios from "axios";
import {logger} from "firebase-functions";
import {defineSecret} from "firebase-functions/params";

// ── Secrets ───────────────────────────────────────────────────────────────────
//
// Defined once here — import and spread into each function's `secrets` option.
//
//   secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID]
//
// Firebase Secret Manager is the sole source. Never use process.env or .env.

export const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
export const TELEGRAM_CHAT_ID = defineSecret("TELEGRAM_CHAT_ID");

// ── Public types ──────────────────────────────────────────────────────────────

export type NotificationPriority = "info" | "warning" | "critical";

export interface TelegramNotificationOptions {
  /** Emoji rendered at the start of the header line. */
  emoji: string;
  /** Short title — auto-uppercased in the rendered message. */
  title: string;
  /**
   * Body content between the two divider lines.
   * Supports Telegram Markdown v1 syntax: *bold*, _italic_, `code`.
   * Always wrap dynamic values (names, IDs, amounts) with escapeMarkdown().
   */
  message: string;
  /** Appends ⚠️ or 🚨 badge to the header. Defaults to "info". */
  priority?: NotificationPriority;
}

// ── Provider contract (extensibility interface) ───────────────────────────────

interface NotificationProvider {
  readonly name: string;
  send(options: TelegramNotificationOptions): Promise<void>;
}

// ── Markdown utilities ────────────────────────────────────────────────────────

/**
 * Escapes Telegram Markdown v1 special characters: _ * ` [
 *
 * Call this on every dynamic value before embedding it in a message string.
 *
 * @example
 * const safe = escapeMarkdown(user.displayName);
 * const body = `*Customer*\n${safe}`;
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/([_*`[])/g, "\\$1");
}

/**
 * Formats [label, value] pairs into a Telegram Markdown body string.
 * Pairs whose value is empty or whitespace-only are silently omitted.
 *
 * @example
 * buildFields([
 *   ["Restaurant", "McDonald's"],
 *   ["Total",      "CA$28.40"],
 *   ["Order",      "#A3F29B"],
 * ])
 * →
 * "*Restaurant*\nMcDonald's\n*Total*\nCA$28.40\n*Order*\n#A3F29B"
 */
export function buildFields(
  fields: ReadonlyArray<readonly [string, string]>,
): string {
  return fields
    .filter(([, value]) => value.trim() !== "")
    .map(([label, value]) => `*${label}*\n${escapeMarkdown(value)}`)
    .join("\n");
}

// ── Internal message renderer ─────────────────────────────────────────────────

const DIVIDER = "────────────────────";

const PRIORITY_BADGE: Record<NotificationPriority, string> = {
  info:     "",
  warning:  " ⚠️",
  critical: " 🚨",
};

function buildText(options: TelegramNotificationOptions): string {
  const badge = PRIORITY_BADGE[options.priority ?? "info"];
  const header = `${options.emoji} *${options.title.toUpperCase()}*${badge}`;
  const footer = "_HalfOrder Admin_";
  return [header, DIVIDER, options.message.trim(), DIVIDER, footer].join("\n");
}

// ── Telegram provider implementation ─────────────────────────────────────────

const TELEGRAM_API_BASE = "https://api.telegram.org";
const REQUEST_TIMEOUT_MS = 5_000;

class TelegramProvider implements NotificationProvider {
  readonly name = "telegram";

  async send(options: TelegramNotificationOptions): Promise<void> {
    const token = TELEGRAM_BOT_TOKEN.value();
    const chatId = TELEGRAM_CHAT_ID.value();

    if (!token || !chatId) {
      logger.warn("[telegram] secrets_missing — notification skipped", {
        title: options.title,
      });
      return;
    }

    const text = buildText(options);
    const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;

    // Token is intentionally excluded from all log output.
    await axios.post(
      url,
      {chat_id: chatId, text, parse_mode: "Markdown"},
      {timeout: REQUEST_TIMEOUT_MS},
    );
  }
}

// ── Provider registry ─────────────────────────────────────────────────────────
//
// Push additional providers (DiscordProvider, SlackProvider, …) here.
// sendTelegramNotification() fans out to every registered provider in parallel.

const providers: NotificationProvider[] = [new TelegramProvider()];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sends an admin notification to all registered providers (currently Telegram).
 *
 * Guaranteed non-throwing: each provider failure is caught, logged with full
 * context, and swallowed. A notification error must never crash production.
 *
 * The calling Cloud Function MUST include the secrets in its function options:
 *
 *   secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID]
 *
 * @example
 * await sendTelegramNotification({
 *   emoji: "🍔",
 *   title: "New HalfOrder",
 *   message: buildFields([
 *     ["Customer",   customerName],
 *     ["Restaurant", restaurantName],
 *     ["Total",      "CA$28.40"],
 *     ["Order",      "#A3F29B"],
 *   ]),
 *   priority: "info",
 * });
 */
export async function sendTelegramNotification(
  options: TelegramNotificationOptions,
): Promise<void> {
  await Promise.allSettled(
    providers.map(async (provider) => {
      try {
        await provider.send(options);
        logger.info("[telegram] sent", {
          provider: provider.name,
          title: options.title,
          priority: options.priority ?? "info",
        });
      } catch (error) {
        // Intentionally not re-thrown — callers must never be affected.
        logger.error("[telegram] send_failed", {
          provider: provider.name,
          title: options.title,
          priority: options.priority ?? "info",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );
}
