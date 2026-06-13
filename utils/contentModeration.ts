import {
  COMMUNITY_GUIDELINES_MESSAGE,
  moderateChatText,
} from '../lib/chatModerationEngine';

export const CONTENT_NOT_ALLOWED = COMMUNITY_GUIDELINES_MESSAGE;

/** @deprecated Use lib/chatModerationEngine — kept for legacy imports. */
export const BANNED_WORDS = ['fuck', 'shit', 'spam link'] as const;

export type ModerationResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

export function moderateUserContent(
  raw: string,
  options?: { maxLength?: number },
): ModerationResult {
  const verdict = moderateChatText({
    text: raw,
    maxLength: options?.maxLength ?? 2000,
  });
  if (!verdict.allowed) {
    return { ok: false, reason: verdict.userMessage };
  }
  return { ok: true, text: verdict.text };
}

export function moderateChatMessage(
  raw: string,
  options: { maxLength: number },
): ModerationResult {
  return moderateUserContent(raw, { maxLength: options.maxLength });
}
