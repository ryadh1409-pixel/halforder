import React, { createContext, useContext, useMemo, useState } from 'react';

export type CartItem = {
  /** Base menu item id (Firestore document id under menuItems). */
  id: string;
  /** Unique line — supports multiple lines for same dish with different options. */
  cartLineId: string;
  name: string;
  price: number;
  qty: number;
  image: string | null;
  restaurantId: string;
  /** Optional kitchen / modifier summary */
  optionsSummary?: string;
};

type CartContextValue = {
  items: CartItem[];
  addToCart: (
    item: Omit<CartItem, 'qty' | 'cartLineId'> & { cartLineId?: string; qty?: number },
  ) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  clearCartForRestaurant: (restaurantId: string) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      addToCart(item) {
        const lineKey = item.cartLineId ?? item.id;
        const addQty = typeof item.qty === 'number' && item.qty > 0 ? Math.floor(item.qty) : 1;
        setItems((prev) => {
          const exists = prev.find((row) => row.cartLineId === lineKey);
          const { qty: _omit, ...rest } = item;
          const line = rest as Omit<CartItem, 'qty'>;
          if (exists) {
            return prev.map((row) =>
              row.cartLineId === lineKey ? { ...row, qty: row.qty + addQty } : row,
            );
          }
          return [...prev, { ...line, cartLineId: lineKey, qty: addQty }];
        });
      },
      removeFromCart(itemId) {
        setItems((prev) =>
          prev
            .map((row) =>
              row.cartLineId === itemId ? { ...row, qty: Math.max(0, row.qty - 1) } : row,
            )
            .filter((row) => row.qty > 0),
        );
      },
      clearCart() {
        setItems([]);
      },
      clearCartForRestaurant(restaurantId) {
        setItems((prev) => prev.filter((row) => row.restaurantId !== restaurantId));
      },
    }),
    [items],
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
