import { streamEmoAiReply } from '@/services/emoAi/emoAiOpenAi';
import {
  loadEmoAiChatStarted,
  loadEmoAiMessages,
  saveEmoAiChatStarted,
  saveEmoAiMessages,
} from '@/services/emoAi/emoAiStorage';
import { db } from '@/services/firebase';
import {
  buildEmoAiStarterMessages,
  type EmoAiMessage,
} from '@/types/emoAi';
import { doc, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';

function newId(): string {
  return `emo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildStarterMessages(userDisplayName: string | null): EmoAiMessage[] {
  const base = Date.now();
  return buildEmoAiStarterMessages(userDisplayName).map((m, i) => ({
    id: newId(),
    role: m.role,
    content: m.content,
    createdAtMs: base + i,
  }));
}

function parseProfileName(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  for (const key of ['name', 'displayName', 'fullName'] as const) {
    const raw = data[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim().split(/\s+/)[0] ?? raw.trim();
  }
  return null;
}

export function useEmoAiChat(uid: string | null) {
  const storageUid = uid?.trim() || 'guest';
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<EmoAiMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const messagesRef = useRef<EmoAiMessage[]>([]);
  const nameRef = useRef<string | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    nameRef.current = userDisplayName;
  }, [userDisplayName]);

  useEffect(() => {
    if (!uid?.trim()) {
      setUserDisplayName(null);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        setUserDisplayName(
          parseProfileName(snap.data() as Record<string, unknown> | undefined),
        );
      },
      () => setUserDisplayName(null),
    );
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [loaded, hasStarted] = await Promise.all([
        loadEmoAiMessages(storageUid),
        loadEmoAiChatStarted(storageUid),
      ]);
      if (cancelled) return;
      setMessages(loaded);
      setStarted(hasStarted || loaded.length > 0);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [storageUid]);

  const persist = useCallback(
    async (next: EmoAiMessage[]) => {
      setMessages(next);
      await saveEmoAiMessages(storageUid, next);
    },
    [storageUid],
  );

  const startChatting = useCallback(async () => {
    const starters = buildStarterMessages(nameRef.current);
    setStarted(true);
    await saveEmoAiChatStarted(storageUid);
    await persist(starters);
  }, [persist, storageUid]);

  const sendMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sendingRef.current) return;
      sendingRef.current = true;
      setError(null);

      if (!started) {
        setStarted(true);
        await saveEmoAiChatStarted(storageUid);
      }

      const userMsg: EmoAiMessage = {
        id: newId(),
        role: 'user',
        content: text,
        createdAtMs: Date.now(),
      };
      const withUser = [...messagesRef.current, userMsg];
      await persist(withUser);

      setTyping(true);
      setStreamingText('');

      await streamEmoAiReply(
        withUser,
        {
          onToken: (token) => {
            setStreamingText((prev) => prev + token);
          },
          onDone: (full) => {
            const assistantMsg: EmoAiMessage = {
              id: newId(),
              role: 'assistant',
              content: full,
              createdAtMs: Date.now(),
            };
            const next = [...withUser, assistantMsg];
            void persist(next);
            setStreamingText('');
            setTyping(false);
            sendingRef.current = false;
          },
          onError: (message) => {
            setError(message);
            setStreamingText('');
            setTyping(false);
            sendingRef.current = false;
          },
        },
        nameRef.current,
      );
    },
    [persist, started, storageUid],
  );

  return {
    ready,
    started,
    messages,
    streamingText,
    typing,
    error,
    userDisplayName,
    startChatting,
    sendMessage,
  };
}
