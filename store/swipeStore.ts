import type { SwipeFilterKey } from '@/constants/swipeDiscovery';
import type { SwipeFoodCard, SwipeMatchPreview } from '@/types/swipe';
import { create } from 'zustand';

type SwipeState = {
  activeFilter: SwipeFilterKey;
  deckIndex: number;
  cards: SwipeFoodCard[];
  lastMatch: SwipeMatchPreview | null;
  joiningOrderId: string | null;
  setFilter: (f: SwipeFilterKey) => void;
  setDeckIndex: (i: number) => void;
  advanceDeck: () => void;
  setCards: (cards: SwipeFoodCard[]) => void;
  setJoining: (id: string | null) => void;
  setLastMatch: (m: SwipeState['lastMatch']) => void;
  resetDeck: () => void;
};

export const useSwipeStore = create<SwipeState>((set, get) => ({
  activeFilter: 'for-you',
  deckIndex: 0,
  cards: [],
  lastMatch: null,
  joiningOrderId: null,
  setFilter: (activeFilter) => set({ activeFilter, deckIndex: 0 }),
  setDeckIndex: (deckIndex) => set({ deckIndex }),
  advanceDeck: () => set({ deckIndex: get().deckIndex + 1 }),
  setCards: (cards) => set({ cards }),
  setJoining: (joiningOrderId) => set({ joiningOrderId }),
  setLastMatch: (lastMatch) => set({ lastMatch }),
  resetDeck: () => set({ deckIndex: 0 }),
}));
