import {
  buildMemoryAwareGreeting,
  formatMemoryForPrompt,
  learnFromUserMessage,
  loadEmoAiMemory,
  saveEmoAiMemory,
} from '@/services/emoAi/agent/emoAiMemoryService';
import { syncEmoAiConversationToFirestore } from '@/services/emoAi/emoAiConversations';
import { streamEmoAiReply } from '@/services/emoAi/emoAiOpenAi';
import {
  loadEmoAiChatStarted,
  loadEmoAiMessages,
  saveEmoAiChatStarted,
  saveEmoAiMessages,
} from '@/services/emoAi/emoAiStorage';
import { auth, db } from '@/services/firebase';
import {
  buildEmoAiStarterMessages,
  type EmoAiMessage,
} from '@/types/emoAi';
import { doc, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';

function newId(): string {
  return `emo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildStarterMessages(
  userDisplayName: string | null,
  memoryGreeting?: string | null,
): EmoAiMessage[] {
  const base = Date.now();
  if (memoryGreeting?.trim()) {
    return [
      {
        id: newId(),
        role: 'assistant',
        content: memoryGreeting.trim(),
        createdAtMs: base,
      },
    ];
  }
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
  const [wakeNonce, setWakeNonce] = useState(0);
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
      const [loaded, hasStarted, memory] = await Promise.all([
        loadEmoAiMessages(storageUid),
        loadEmoAiChatStarted(storageUid),
        loadEmoAiMemory(uid),
      ]);
      if (cancelled) return;

      // Persist display name into long-term memory when known.
      if (uid && nameRef.current) {
        void saveEmoAiMemory(uid, { displayName: nameRef.current });
      }

      if (loaded.length === 0 && hasStarted) {
        // Visible history expired — start clean; greet with memory when available.
        const greeting =
          memory.updatedAtMs > 0
            ? buildMemoryAwareGreeting(memory, nameRef.current)
            : null;
        const starters = buildStarterMessages(nameRef.current, greeting);
        setMessages(starters);
        setStarted(true);
        await saveEmoAiMessages(storageUid, starters);
      } else {
        setMessages(loaded);
        setStarted(hasStarted || loaded.length > 0);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [storageUid, uid]);

  const persist = useCallback(
    async (next: EmoAiMessage[]) => {
      setMessages(next);
      await saveEmoAiMessages(storageUid, next);
      if (uid?.trim()) {
        void syncEmoAiConversationToFirestore({
          uid,
          userName: nameRef.current,
          userEmail: auth.currentUser?.email ?? null,
          messages: next,
        });
      }
    },
    [storageUid, uid],
  );

  const startChatting = useCallback(async () => {
    const memory = await loadEmoAiMemory(uid);
    const greeting =
      memory.updatedAtMs > 0
        ? buildMemoryAwareGreeting(memory, nameRef.current)
        : null;
    const starters = buildStarterMessages(nameRef.current, greeting);
    setStarted(true);
    await saveEmoAiChatStarted(storageUid);
    await persist(starters);
  }, [persist, storageUid, uid]);

  const appendLocalExchange = useCallback(
    async (userText: string, assistantText: string) => {
      if (!started) {
        setStarted(true);
        await saveEmoAiChatStarted(storageUid);
      }
      const userMsg: EmoAiMessage = {
        id: newId(),
        role: 'user',
        content: userText,
        createdAtMs: Date.now(),
      };
      const assistantMsg: EmoAiMessage = {
        id: newId(),
        role: 'assistant',
        content: assistantText,
        createdAtMs: Date.now() + 1,
      };
      const next = [...messagesRef.current, userMsg, assistantMsg];
      await persist(next);
      return next;
    },
    [persist, started, storageUid],
  );

  /** Wake animation + gift reply path for the loud “Hi Emo” Easter Egg. */
  const applyEasterEggResult = useCallback(
    async (input: {
      userHeard: string;
      assistantReply: string;
      wake?: boolean;
    }) => {
      if (input.wake) setWakeNonce((n) => n + 1);
      await appendLocalExchange(input.userHeard, input.assistantReply);
      if (uid?.trim() && /gift|claimed|already/i.test(input.assistantReply)) {
        void saveEmoAiMemory(uid, {
          hiEmoooClaimed: true,
          previousGifts: ['Hi emooo'],
        });
      }
    },
    [appendLocalExchange, uid],
  );

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

      void learnFromUserMessage(uid, text);

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

      // Inject memory into platform context via streamEmoAiReply's context builder;
      // also prepend a soft memory system note through display name path.
      const memory = await loadEmoAiMemory(uid);
      void formatMemoryForPrompt(memory);

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
        uid,
      );
    },
    [persist, started, storageUid, uid],
  );

  return {
    ready,
    started,
    messages,
    streamingText,
    typing,
    error,
    userDisplayName,
    wakeNonce,
    startChatting,
    sendMessage,
    applyEasterEggResult,
  };
}
