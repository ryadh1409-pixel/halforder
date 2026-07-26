import {
  createAdminAiMessage,
  runAdminAiAssistant,
} from '@/services/adminAiAssistant/adminAiAssistantEngine';
import {
  ADMIN_AI_SUGGESTION_CHIPS,
  buildAdminAiGreeting,
  type AdminAiMessage,
} from '@/types/adminAiAssistant';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

function firstNameFrom(displayName: string | null | undefined): string {
  const raw = (displayName ?? '').trim();
  if (!raw) return 'there';
  return raw.split(/\s+/).filter(Boolean)[0] || 'there';
}

export function useAdminAiAssistant(adminDisplayName: string | null | undefined) {
  const router = useRouter();
  const greeting = useMemo(
    () => buildAdminAiGreeting(firstNameFrom(adminDisplayName)),
    [adminDisplayName],
  );

  const [messages, setMessages] = useState<AdminAiMessage[]>(() => [
    createAdminAiMessage('assistant', greeting, {
      suggestions: ADMIN_AI_SUGGESTION_CHIPS.map((c) => c.label),
    }),
  ]);
  const [draft, setDraft] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [typing, setTyping] = useState(false);
  const busyRef = useRef(false);

  const send = useCallback(
    async (text?: string) => {
      const body = (text ?? draft).trim();
      if (!body || busyRef.current) return;
      busyRef.current = true;
      setDraft('');
      setMessages((prev) => [...prev, createAdminAiMessage('user', body)]);
      setTyping(true);
      setStreamingText('');

      await runAdminAiAssistant(body, {
        onToken: (token) => {
          setStreamingText((prev) => prev + token);
        },
        onDone: (result) => {
          setTyping(false);
          setStreamingText('');
          setMessages((prev) => [
            ...prev,
            createAdminAiMessage('assistant', result.content, {
              entities: result.entities,
              navigate: result.navigate,
              suggestions: result.suggestions,
            }),
          ]);
          busyRef.current = false;
          if (result.autoNavigate && result.navigate?.href) {
            setTimeout(() => {
              router.push(result.navigate!.href as never);
            }, 450);
          }
        },
        onError: (message) => {
          setTyping(false);
          setStreamingText('');
          setMessages((prev) => [
            ...prev,
            createAdminAiMessage('assistant', message),
          ]);
          busyRef.current = false;
        },
      });
    },
    [draft, router],
  );

  const openEntity = useCallback(
    (href: string) => {
      router.push(href as never);
    },
    [router],
  );

  return {
    messages,
    draft,
    setDraft,
    send,
    streamingText,
    typing,
    chips: ADMIN_AI_SUGGESTION_CHIPS,
    openEntity,
    greeting,
  };
}
