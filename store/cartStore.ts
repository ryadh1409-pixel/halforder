import { create } from 'zustand';

/** Cart line — mirrors legacy `CartContext` shape for Firebase order flows. */
export type CartLine = {
  id: string;
  cartLineId: string;
  name: string;
  price: number;
  qty: number;
  image: string | null;
  restaurantId: string;
  optionsSummary?: string;
};

export type CartAddInput = Omit<CartLine, 'qty' | 'cartLineId'> & {
  cartLineId?: string;
  qty?: number;
};

type CartState = {
  items: CartLine[];
  activeRestaurantId: string | null;
  addToCart: (item: CartAddInput) => void;
  removeFromCart: (cartLineId: string) => void;
  clearCart: () => void;
  clearCartForRestaurant: (restaurantId: string) => void;
  setActiveRestaurant: (restaurantId: string | null) => void;
};

export const useCartStore = create<CartState>((set) => ({
  items: [],
  activeRestaurantId: null,

  addToCart(item) {
    const lineKey = item.cartLineId ?? item.id;
    const addQty =
      typeof item.qty === 'number' && item.qty > 0 ? Math.floor(item.qty) : 1;
    set((state) => {
      const exists = state.items.find((row) => row.cartLineId === lineKey);
      const { qty: _omit, ...rest } = item;
      const line = rest as Omit<CartLine, 'qty'>;
      if (exists) {
        return {
          activeRestaurantId: item.restaurantId,
          items: state.items.map((row) =>
            row.cartLineId === lineKey
              ? { ...row, qty: row.qty + addQty }
              : row,
          ),
        };
      }
      return {
        activeRestaurantId: item.restaurantId,
        items: [...state.items, { ...line, cartLineId: lineKey, qty: addQty }],
      };
    });
  },

  removeFromCart(cartLineId) {
    set((state) => ({
      items: state.items
        .map((row) =>
          row.cartLineId === cartLineId
            ? { ...row, qty: Math.max(0, row.qty - 1) }
            : row,
        )
        .filter((row) => row.qty > 0),
    }));
  },

  clearCart() {
    set({ items: [], activeRestaurantId: null });
  },

  clearCartForRestaurant(restaurantId) {
    set((state) => ({
      items: state.items.filter((row) => row.restaurantId !== restaurantId),
      activeRestaurantId:
        state.activeRestaurantId === restaurantId
          ? null
          : state.activeRestaurantId,
    }));
  },

  setActiveRestaurant(restaurantId) {
    set({ activeRestaurantId: restaurantId });
  },
}));

export function selectCartTotals(
  items: CartLine[],
  restaurantId?: string | null,
) {
  const scoped = restaurantId
    ? items.filter((c) => c.restaurantId === restaurantId)
    : items;
  const qty = scoped.reduce((s, c) => s + c.qty, 0);
  const subtotal = scoped.reduce((s, c) => s + c.price * c.qty, 0);
  return { qty, subtotal, scoped };
}
