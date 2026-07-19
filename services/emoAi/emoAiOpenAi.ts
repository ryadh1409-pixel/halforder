import Constants from 'expo-constants';
import OpenAI from 'openai';

import { buildEmoAiSystemPrompt } from '@/services/emoAi/emoAiPrompt';
import type { EmoAiMessage } from '@/types/emoAi';

function openAiApiKey(): string | undefined {
  const fromEnv =
    typeof process !== 'undefined'
      ? (
          process.env?.EXPO_PUBLIC_OPENAI_API_KEY ||
          process.env?.OPENAI_API_KEY ||
          ''
        ).trim()
      : '';
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const fromExtra =
    typeof extra?.openaiApiKey === 'string' ? extra.openaiApiKey.trim() : '';
  return fromEnv || fromExtra || undefined;
}

function toOpenAiMessages(
  history: EmoAiMessage[],
  userDisplayName: string | null,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: buildEmoAiSystemPrompt(userDisplayName) },
    ...history.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];
}

export type EmoAiStreamHandlers = {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (message: string) => void;
};

/**
 * Stream an Emo AI reply. Falls back to a non-stream completion if streaming fails.
 */
export async function streamEmoAiReply(
  history: EmoAiMessage[],
  handlers: EmoAiStreamHandlers,
  userDisplayName: string | null = null,
): Promise<void> {
  const key = openAiApiKey();
  if (!key) {
    handlers.onError(
      'Emo AI is taking a snack break — OpenAI key is missing. Add OPENAI_API_KEY and restart.',
    );
    return;
  }

  const client = new OpenAI({
    apiKey: key,
    dangerouslyAllowBrowser: true,
  });
  const messages = toOpenAiMessages(history, userDisplayName);

  try {
    const stream = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      stream: true,
      max_tokens: 220,
      temperature: 0.85,
    });

    let full = '';
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? '';
      if (!token) continue;
      full += token;
      handlers.onToken(token);
    }
    const trimmed = full.trim();
    if (!trimmed) {
      handlers.onError('Emo went quiet for a second — try again?');
      return;
    }
    handlers.onDone(trimmed);
  } catch (streamErr) {
    try {
      const res = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 220,
        temperature: 0.85,
      });
      const text = res.choices[0]?.message?.content?.trim() ?? '';
      if (!text) {
        handlers.onError('Emo went quiet for a second — try again?');
        return;
      }
      handlers.onToken(text);
      handlers.onDone(text);
    } catch {
      const msg =
        streamErr instanceof Error
          ? streamErr.message
          : 'Could not reach Emo AI right now.';
      handlers.onError(msg);
    }
  }
}
