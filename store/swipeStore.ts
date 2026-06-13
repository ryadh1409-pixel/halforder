import type { SwipeFoodCard, SwipeMatchPreview } from '@/types/swipe';
import { create } from 'zustand';

type SwipeState = {
  deckIndex: number;
  cards: SwipeFoodCard[];
  lastMatch: SwipeMatchPreview | null;
  joiningOrderId: string | null;
  setDeckIndex: (i: number) => void;
  advanceDeck: () => void;
  setCards: (cards: SwipeFoodCard[]) => void;
  setJoining: (id: string | null) => void;
  setLastMatch: (m: SwipeState['lastMatch']) => void;
};

export const useSwipeStore = create<SwipeState>((set, get) => ({
  deckIndex: 0,
  cards: [],
  lastMatch: null,
  joiningOrderId: null,
  setDeckIndex: (deckIndex) => set({ deckIndex }),
  advanceDeck: () => set({ deckIndex: get().deckIndex + 1 }),
  setCards: (cards) => set({ cards, deckIndex: 0 }),
  setJoining: (joiningOrderId) => set({ joiningOrderId }),
  setLastMatch: (lastMatch) => set({ lastMatch }),
}));
