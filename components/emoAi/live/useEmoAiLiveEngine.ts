import { useIsFocused } from '@react-navigation/native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  analyzeEmoUserMessage,
  pickRandomIdleAction,
  randBetween,
} from './emoAiEmotionEngine';
import type {
  EmoCompanionSnapshot,
  EmoEmotion,
  EmoFoodProp,
  EmoIdleAction,
} from './emoAiCompanionTypes';

const IDLE_MS = 15_000;
const IDLE_ACTION_MS = 4200;

type Args = {
  typing: boolean;
  streaming: boolean;
  lastUserMessage: string | null;
  /** Increment to force a fun wake-from-sleep burst. */
  wakeNonce?: number;
};

/**
 * Conversation-aware companion brain for the Emo AI hero only.
 * Pauses when the tab is blurred or the app is backgrounded.
 */
export function useEmoAiLiveEngine({
  typing,
  streaming,
  lastUserMessage,
  wakeNonce = 0,
}: Args): EmoCompanionSnapshot & { alive: boolean } {
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const alive = focused && appActive;

  const [emotion, setEmotion] = useState<EmoEmotion>('neutral');
  const [food, setFood] = useState<EmoFoodProp>('pizza');
  const [idleAction, setIdleAction] = useState<EmoIdleAction | null>(null);
  const [catCloser, setCatCloser] = useState(false);
  const [catSleeping, setCatSleeping] = useState(false);
  const [offerFood, setOfferFood] = useState(false);
  const [calmLights, setCalmLights] = useState(false);
  const [heartEyes, setHeartEyes] = useState(false);
  const [eatingBurst, setEatingBurst] = useState(false);

  const lastMsgRef = useRef<string | null>(null);
  const lastIdleRef = useRef<EmoIdleAction | null>(null);
  const lastInteractRef = useRef(Date.now());

  useEffect(() => {
    const onChange = (s: AppStateStatus) => setAppActive(s === 'active');
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (typing || streaming || lastUserMessage) {
      lastInteractRef.current = Date.now();
      setIdleAction(null);
    }
  }, [typing, streaming, lastUserMessage]);

  useEffect(() => {
    if (!lastUserMessage || lastUserMessage === lastMsgRef.current) return;
    lastMsgRef.current = lastUserMessage;
    const a = analyzeEmoUserMessage(lastUserMessage);
    setEmotion(a.emotion);
    setFood(a.food === 'none' ? 'pizza' : a.food);
    setCatCloser(a.catCloser);
    setCatSleeping(a.catSleeping);
    setOfferFood(a.offerFood);
    setCalmLights(a.calmLights);
    setHeartEyes(a.heartEyes);
    if (a.forceEat || a.forceExcited) {
      setEatingBurst(true);
      const t = setTimeout(() => setEatingBurst(false), 3200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [lastUserMessage]);

  useEffect(() => {
    if (!wakeNonce) return undefined;
    lastInteractRef.current = Date.now();
    setCatSleeping(false);
    setCalmLights(false);
    setEmotion('excited');
    setHeartEyes(true);
    setEatingBurst(true);
    setIdleAction(null);
    const t = setTimeout(() => {
      setEatingBurst(false);
      setHeartEyes(false);
      setEmotion('happy');
    }, 4200);
    return () => clearTimeout(t);
  }, [wakeNonce]);

  useEffect(() => {
    if (!alive || typing || streaming || idleAction) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      const wait = Math.max(
        400,
        IDLE_MS - (Date.now() - lastInteractRef.current) + randBetween(0, 2500),
      );
      timer = setTimeout(() => {
        if (cancelled) return;
        if (Date.now() - lastInteractRef.current < IDLE_MS) {
          schedule();
          return;
        }
        const next = pickRandomIdleAction(lastIdleRef.current);
        lastIdleRef.current = next;
        setIdleAction(next);
        if (next === 'eatPizza') {
          setFood('pizza');
          setEatingBurst(true);
        } else if (next === 'drinkCoffee') {
          setFood('coffee');
        } else if (next === 'yawn') {
          setEmotion('sleepy');
        } else if (next === 'smile' || next === 'wave') {
          setEmotion('happy');
        } else if (next === 'petCat' || next === 'playCat') {
          setCatCloser(true);
          setCatSleeping(false);
        }
        setTimeout(() => {
          if (cancelled) return;
          setIdleAction(null);
          setEatingBurst(false);
          lastInteractRef.current = Date.now();
          schedule();
        }, IDLE_ACTION_MS + randBetween(0, 1200));
      }, wait);
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [alive, typing, streaming, idleAction]);

  const phase = useMemo(() => {
    if (typing && !streaming) return 'thinking' as const;
    if (streaming) return 'speaking' as const;
    if (eatingBurst || idleAction === 'eatPizza') return 'eating' as const;
    if (idleAction) return 'idleAction' as const;
    return 'idle' as const;
  }, [typing, streaming, eatingBurst, idleAction]);

  const displayEmotion: EmoEmotion =
    phase === 'thinking' ? 'thinking' : emotion;

  return {
    alive,
    phase,
    emotion: displayEmotion,
    food,
    idleAction,
    lookAtMessage: phase === 'thinking' || phase === 'speaking',
    catCloser,
    catSleeping: phase === 'speaking' || phase === 'thinking' ? false : catSleeping,
    offerFood,
    calmLights,
    heartEyes: heartEyes && displayEmotion === 'lonely',
  };
}
