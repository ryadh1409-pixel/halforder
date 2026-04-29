import React, { createContext, useContext, useMemo, useState } from 'react';

export type CartItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  image: string | null;
  restaurantId: string;
};

type CartContextValue = {
  items: CartItem[];
  addToCart: (item: Omit<CartItem, 'qty'>) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      addToCart(item) {
        setItems((prev) => {
          const exists = prev.find((row) => row.id === item.id);
          if (exists) {
            return prev.map((row) =>
              row.id === item.id ? { ...row, qty: row.qty + 1 } : row,
            );
          }
          return [...prev, { ...item, qty: 1 }];
        });
      },
      removeFromCart(itemId) {
        setItems((prev) =>
          prev
            .map((row) =>
              row.id === itemId ? { ...row, qty: Math.max(0, row.qty - 1) } : row,
            )
            .filter((row) => row.qty > 0),
        );
      },
      clearCart() {
        setItems([]);
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
