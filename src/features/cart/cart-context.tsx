"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  cartConfigurationKey,
  cartLineId,
  cartUnitTotal,
  type CartItem,
} from "./cart-items";
export type { CartItem } from "./cart-items";

const CART_STORAGE_KEY = "miro-cart-v1";
const MAX_CART_QUANTITY = 99;

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  hydrated: boolean;
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
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
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const EMPTY_CART: CartItem[] = [];
const cartListeners = new Set<() => void>();
let cartItems: CartItem[] = EMPTY_CART;
let cartInitialized = false;
let storageListening = false;

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CartItem>;
  return (
    typeof item.productId === "string" &&
    typeof item.slug === "string" &&
    typeof item.category === "string" &&
    typeof item.name === "string" &&
    (item.variantId === null || typeof item.variantId === "string") &&
    (item.imageUrl === null || typeof item.imageUrl === "string") &&
    typeof item.unitPrice === "number" &&
    Number.isFinite(item.unitPrice) &&
    item.unitPrice >= 0 &&
    typeof item.quantity === "number" &&
    Number.isInteger(item.quantity) &&
    item.quantity > 0 &&
    (item.lineId === undefined ||
      (typeof item.lineId === "string" && item.lineId.length <= 120)) &&
    (item.optionalOffers === undefined ||
      (Array.isArray(item.optionalOffers) &&
        item.optionalOffers.length <= 99 &&
        new Set(item.optionalOffers.map((offer) => offer?.id)).size ===
          item.optionalOffers.length &&
        item.optionalOffers.every(
          (offer) =>
            offer &&
            typeof offer.id === "string" &&
            typeof offer.productId === "string" &&
            typeof offer.variantId === "string" &&
            typeof offer.name === "string" &&
            typeof offer.sku === "string" &&
            typeof offer.slug === "string" &&
            typeof offer.category === "string" &&
            typeof offer.label === "string" &&
            (offer.kind === "complementary" || offer.kind === "accompanying") &&
            Number.isInteger(offer.revision) &&
            offer.revision >= 0 &&
            Number.isFinite(offer.unitPrice) &&
            offer.unitPrice > 0 &&
            (offer.imageUrl === null || typeof offer.imageUrl === "string"),
        )))
  );
}

function readStoredCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartItem).map((item) => ({
      ...item,
      quantity: Math.min(item.quantity, MAX_CART_QUANTITY),
    }));
  } catch {
    return [];
  }
}

function emitCartChange() {
  for (const listener of cartListeners) listener();
}

function initializeCart() {
  if (cartInitialized || typeof window === "undefined") return;
  cartItems = readStoredCart();
  cartInitialized = true;
}

function onCartStorage(event: StorageEvent) {
  if (event.key !== CART_STORAGE_KEY) return;
  cartItems = readStoredCart();
  emitCartChange();
}

function subscribeCart(listener: () => void) {
  cartListeners.add(listener);
  const wasInitialized = cartInitialized;
  initializeCart();
  if (!storageListening) {
    window.addEventListener("storage", onCartStorage);
    storageListening = true;
  }
  if (!wasInitialized) queueMicrotask(listener);

  return () => {
    cartListeners.delete(listener);
    if (cartListeners.size === 0 && storageListening) {
      window.removeEventListener("storage", onCartStorage);
      storageListening = false;
    }
  };
}

function getCartSnapshot() {
  return cartItems;
}

function getServerCartSnapshot() {
  return EMPTY_CART;
}

function getHydratedSnapshot() {
  return cartInitialized;
}

function getServerHydratedSnapshot() {
  return false;
}

function changeCart(update: (current: CartItem[]) => CartItem[]) {
  initializeCart();
  cartItems = update(cartItems);
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
  } catch {
    // The cart still works for this page view when storage is unavailable.
  }
  emitCartChange();
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const items = useSyncExternalStore(
    subscribeCart,
    getCartSnapshot,
    getServerCartSnapshot,
  );
  const hydrated = useSyncExternalStore(
    subscribeCart,
    getHydratedSnapshot,
    getServerHydratedSnapshot,
  );

  const addItem = useCallback(
    (item: Omit<CartItem, "quantity">, quantity = 1) => {
      const safeQuantity = Math.max(
        1,
        Math.min(Math.floor(quantity), MAX_CART_QUANTITY),
      );
      changeCart((current) => {
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

  const clearCart = useCallback(() => changeCart(() => EMPTY_CART), []);
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
