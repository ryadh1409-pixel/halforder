import { httpsCallable } from 'firebase/functions';

import {
  buildEmoAiPlatformContext,
  formatPlatformContextForPrompt,
} from '@/services/emoAi/agent/emoAiContextService';
import { buildEmoAiSystemPrompt } from '@/services/emoAi/emoAiPrompt';
import { functions, syncAuthForFirestoreReads } from '@/services/firebase';
import type { EmoAiMessage } from '@/types/emoAi';

export type EmoAiStreamHandlers = {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (message: string) => void;
};

/**
 * Animate a full reply locally so UI can keep the streaming affordance
 * without exposing OpenAI secrets or requiring SSE from Functions.
 */
async function animateReply(
  fullText: string,
  onToken: (token: string) => void,
): Promise<void> {
  const chunkSize = 3;
  for (let i = 0; i < fullText.length; i += chunkSize) {
    onToken(fullText.slice(i, i + chunkSize));
    await new Promise((r) => setTimeout(r, 12));
  }
}

/**
 * Stream an Emo AI reply via Firebase Callable (OpenAI key stays server-side).
 * Falls back to a local character notice if the callable is unavailable.
 */
export async function streamEmoAiReply(
  history: EmoAiMessage[],
  handlers: EmoAiStreamHandlers,
  userDisplayName: string | null = null,
  uid: string | null = null,
): Promise<void> {
  let platformContext = '';
  try {
    const ctx = await buildEmoAiPlatformContext({
      uid,
      latestUserMessage: [...history].reverse().find((m) => m.role === 'user')?.content ?? null,
    });
    platformContext = formatPlatformContextForPrompt(ctx);
  } catch {
    platformContext =
      'LIVE HALFORDER PLATFORM DATA unavailable this turn — stay in character as Tham and avoid inventing specific prices.';
  }

  // Keep prompt builder imported so character docs stay in sync for local tooling.
  void buildEmoAiSystemPrompt;

  try {
    await syncAuthForFirestoreReads();
    const fn = httpsCallable(functions, 'emoAiChat');
    const result = await fn({
      messages: history.map((m) => ({ role: m.role, content: m.content })),
      userDisplayName: userDisplayName ?? '',
      platformContext,
    });
    const data = result.data as { reply?: unknown };
    const reply =
      typeof data?.reply === 'string' ? data.reply.trim() : '';
    if (!reply) {
      handlers.onError('Emo went quiet for a second — try again?');
      return;
    }
    await animateReply(reply, handlers.onToken);
    handlers.onDone(reply);
  } catch (e) {
    const msg =
      e && typeof e === 'object' && 'message' in e
        ? String((e as { message?: unknown }).message)
        : 'Could not reach Emo AI right now.';
    const code =
      e && typeof e === 'object' && 'code' in e
        ? String((e as { code?: unknown }).code)
        : '';
    if (
      code.includes('not-found') ||
      code.includes('unimplemented') ||
      /not found|does not exist/i.test(msg)
    ) {
      handlers.onError(
        'Emo AI backend is not deployed yet. Deploy Firebase function emoAiChat, then try again.',
      );
      return;
    }
    handlers.onError(msg || 'Could not reach Emo AI right now.');
  }
}
