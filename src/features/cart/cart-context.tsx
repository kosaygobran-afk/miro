"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  changeCart,
  getShoppingSnapshot,
  getServerShoppingSnapshot,
  retryShopping,
  setWishlisted,
  subscribeShopping,
} from "./shopping-store";
import type { ShoppingAccount, ShoppingData } from "./shopping-types";
import {
  cartConfigurationKey,
  cartLineId,
  cartUnitTotal,
  type CartItem,
} from "./cart-items";
export type { CartItem } from "./cart-items";

const MAX_CART_QUANTITY = 99;

type CartContextValue = {
  wishlist: ShoppingData["wishlist"];
  account: ShoppingAccount | null;
  saving: boolean;
  syncIssue: boolean;
  retryShopping: () => void;
  setWishlisted: (id: string, saved: boolean) => void;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  hydrated: boolean;
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => boolean;
  updateQuantity: (
    productId: string,
    variantId: string | null,
    quantity: number,
    lineId?: string,
  ) => void;
  removeItem: (
    productId: string,
    variantId: string | null,
    lineId?: string,
  ) => void;
  clearCart: (purchased?: CartItem[], expectedOwner?: string | null) => void;
};

const CartContext = createContext<CartContextValue | null>(null);
export function CartProvider({
  children,
  syncAccount = false,
}: {
  children: React.ReactNode;
  syncAccount?: boolean;
}) {
  const subscribe = useCallback(
    (listener: () => void) => subscribeShopping(listener, syncAccount),
    [syncAccount],
  );
  const {
    cart: items,
    wishlist,
    hydrated,
    account,
    issue: syncIssue,
    saving,
  } = useSyncExternalStore(
    subscribe,
    getShoppingSnapshot,
    getServerShoppingSnapshot,
  );

  const addItem = useCallback(
    (item: Omit<CartItem, "quantity">, quantity = 1) => {
      const safeQuantity = Math.max(
        1,
        Math.min(Math.floor(quantity), MAX_CART_QUANTITY),
      );
      return changeCart((current) => {
        const key = cartConfigurationKey(item);
        const existing = current.find(
          (entry) => cartConfigurationKey(entry) === key,
        );
        if (!existing)
          return [
            ...current,
            { ...item, lineId: crypto.randomUUID(), quantity: safeQuantity },
          ];
        return current.map((entry) =>
          cartConfigurationKey(entry) === key
            ? {
                ...entry,
                ...item,
                lineId: entry.lineId,
                quantity: Math.min(
                  entry.quantity + safeQuantity,
                  MAX_CART_QUANTITY,
                ),
              }
            : entry,
        );
      });
    },
    [],
  );

  const updateQuantity = useCallback(
    (
      productId: string,
      variantId: string | null,
      quantity: number,
      lineId?: string,
    ) => {
      const matches = (item: CartItem) =>
        lineId
          ? cartLineId(item) === lineId
          : cartConfigurationKey(item) ===
            cartConfigurationKey({ productId, variantId });
      if (quantity <= 0) {
        changeCart((current) => current.filter((item) => !matches(item)));
        return;
      }
      const safeQuantity = Math.min(
        Math.max(1, Math.floor(quantity)),
        MAX_CART_QUANTITY,
      );
      changeCart((current) =>
        current.map((item) =>
          matches(item) ? { ...item, quantity: safeQuantity } : item,
        ),
      );
    },
    [],
  );

  const removeItem = useCallback(
    (productId: string, variantId: string | null, lineId?: string) => {
      changeCart((current) =>
        current.filter((item) =>
          lineId
            ? cartLineId(item) !== lineId
            : cartConfigurationKey(item) !==
              cartConfigurationKey({ productId, variantId }),
        ),
      );
    },
    [],
  );

  const clearCart = useCallback(
    (purchased?: CartItem[], expectedOwner?: string | null) => {
      if (
        expectedOwner !== undefined &&
        (getShoppingSnapshot().account?.id ?? null) !== expectedOwner
      )
        return;
      const quantities = new Map(
        purchased?.map((item) => [cartConfigurationKey(item), item.quantity]),
      );
      changeCart((current) =>
        purchased
          ? current.flatMap((item) => {
              const remaining =
                item.quantity -
                (quantities.get(cartConfigurationKey(item)) ?? 0);
              return remaining > 0 ? [{ ...item, quantity: remaining }] : [];
            })
          : [],
      );
    },
    [],
  );
  const itemCount = items.reduce(
    (total, item) =>
      total + item.quantity * (1 + (item.optionalOffers?.length ?? 0)),
    0,
  );
  const subtotal =
    items.reduce(
      (total, item) =>
        total + Math.round(cartUnitTotal(item) * 100) * item.quantity,
      0,
    ) / 100;
  const value = useMemo(
    () => ({
      items,
      wishlist,
      account,
      saving,
      syncIssue,
      retryShopping,
      setWishlisted,
      itemCount,
      subtotal,
      hydrated,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
    }),
    [
      items,
      wishlist,
      account,
      saving,
      syncIssue,
      itemCount,
      subtotal,
      hydrated,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider");
  return value;
}
