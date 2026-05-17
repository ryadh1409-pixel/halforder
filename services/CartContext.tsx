import { useCartStore, type CartAddInput, type CartLine } from '@/store/cartStore';
import React, { createContext, useContext, useMemo } from 'react';

export type CartItem = CartLine;

type CartContextValue = {
  items: CartItem[];
  addToCart: (item: CartAddInput) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  clearCartForRestaurant: (restaurantId: string) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

/** Bridges Zustand cart store for legacy `useCart()` consumers. */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const items = useCartStore((s) => s.items);
  const addToCart = useCartStore((s) => s.addToCart);
  const removeFromCart = useCartStore((s) => s.removeFromCart);
  const clearCart = useCartStore((s) => s.clearCart);
  const clearCartForRestaurant = useCartStore((s) => s.clearCartForRestaurant);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      addToCart,
      removeFromCart,
      clearCart,
      clearCartForRestaurant,
    }),
    [items, addToCart, removeFromCart, clearCart, clearCartForRestaurant],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within CartProvider');
  }
  return ctx;
}

/** Direct Zustand access — preferred in new screens. */
export { useCartStore, selectCartTotals } from '@/store/cartStore';
