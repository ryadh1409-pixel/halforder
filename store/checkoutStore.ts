import type {
  CheckoutDeliveryTiming,
  CheckoutFulfillmentMode,
} from '@/types/checkoutFlow';
import { create } from 'zustand';

type CheckoutState = {
  fulfillmentMode: CheckoutFulfillmentMode;
  timing: CheckoutDeliveryTiming;
  promoCode: string;
  gift: boolean;
  deliveryInstructions: string;
  addressPrimary: string;
  phone: string;
  setFulfillmentMode: (mode: CheckoutFulfillmentMode) => void;
  setTiming: (timing: CheckoutDeliveryTiming) => void;
  setPromoCode: (code: string) => void;
  setGift: (gift: boolean) => void;
  setDeliveryInstructions: (text: string) => void;
  setAddressPrimary: (text: string) => void;
  setPhone: (text: string) => void;
  reset: () => void;
};

const initial = {
  fulfillmentMode: 'delivery' as CheckoutFulfillmentMode,
  timing: 'standard' as CheckoutDeliveryTiming,
  promoCode: '',
  gift: false,
  deliveryInstructions: '',
  addressPrimary: '',
  phone: '',
};

export const useCheckoutStore = create<CheckoutState>((set) => ({
  ...initial,
  setFulfillmentMode: (fulfillmentMode) => set({ fulfillmentMode }),
  setTiming: (timing) => set({ timing }),
  setPromoCode: (promoCode) => set({ promoCode }),
  setGift: (gift) => set({ gift }),
  setDeliveryInstructions: (deliveryInstructions) =>
    set({ deliveryInstructions }),
  setAddressPrimary: (addressPrimary) => set({ addressPrimary }),
  setPhone: (phone) => set({ phone }),
  reset: () => set(initial),
}));
