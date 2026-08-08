import type { SwipeFoodCard, SwipeMatchPreview } from '@/types/swipe';
import { create } from 'zustand';

type SwipeState = {
  deckIndex: number;
  cards: SwipeFoodCard[];
  lastMatch: SwipeMatchPreview | null;
  joiningOrderId: string | null;
  /** IDs of cards passed during this session. Cleared on app restart (in-memory only). */
  passedIds: Set<string>;
  setDeckIndex: (i: number) => void;
  advanceDeck: () => void;
  setCards: (cards: SwipeFoodCard[]) => void;
  removeCard: (adminFoodShareId: string) => void;
  /** Mark a card as passed for this session — suppresses it from the deck without removing the swipe record. */
  passCard: (adminFoodShareId: string) => void;
  setJoining: (id: string | null) => void;
  setLastMatch: (m: SwipeState['lastMatch']) => void;
};

export const useSwipeStore = create<SwipeState>((set, get) => ({
  deckIndex: 0,
  cards: [],
  lastMatch: null,
  joiningOrderId: null,
  passedIds: new Set<string>(),
  setDeckIndex: (deckIndex) => set({ deckIndex }),
  advanceDeck: () => set({ deckIndex: get().deckIndex + 1 }),
  setCards: (cards) => set({ cards, deckIndex: 0 }),
  removeCard: (adminFoodShareId) =>
    set((state) => ({
      cards: state.cards.filter((card) => card.adminFoodShareId !== adminFoodShareId),
      deckIndex: Math.min(
        state.deckIndex,
        Math.max(
          0,
          state.cards.filter((card) => card.adminFoodShareId !== adminFoodShareId).length - 1,
        ),
      ),
    })),
  passCard: (adminFoodShareId) =>
    set((state) => ({ passedIds: new Set([...state.passedIds, adminFoodShareId]) })),
  setJoining: (joiningOrderId) => set({ joiningOrderId }),
  setLastMatch: (lastMatch) => set({ lastMatch }),
}));
