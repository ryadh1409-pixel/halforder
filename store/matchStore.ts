import type {
  SharedOrderMessage,
  SharedOrderParticipant,
  SharedOrderRoom,
} from '@/types/swipe';
import { create } from 'zustand';

type MatchState = {
  activeRoomId: string | null;
  activeRoom: SharedOrderRoom | null;
  participants: SharedOrderParticipant[];
  messages: SharedOrderMessage[];
  loading: boolean;
  setActiveRoomId: (id: string | null) => void;
  setActiveRoom: (room: SharedOrderRoom | null) => void;
  setParticipants: (participants: SharedOrderParticipant[]) => void;
  setMessages: (messages: SharedOrderMessage[]) => void;
  setLoading: (loading: boolean) => void;
  clearMatchRoom: () => void;
};

export const useMatchStore = create<MatchState>((set) => ({
  activeRoomId: null,
  activeRoom: null,
  participants: [],
  messages: [],
  loading: true,
  setActiveRoomId: (activeRoomId) => set({ activeRoomId }),
  setActiveRoom: (activeRoom) => set({ activeRoom }),
  setParticipants: (participants) => set({ participants }),
  setMessages: (messages) => set({ messages }),
  setLoading: (loading) => set({ loading }),
  clearMatchRoom: () =>
    set({
      activeRoomId: null,
      activeRoom: null,
      participants: [],
      messages: [],
      loading: true,
    }),
}));
