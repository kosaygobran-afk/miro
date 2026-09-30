"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

const CART_STORAGE_KEY = "miro-cart-v1";
const MAX_CART_QUANTITY = 99;

export type CartItem = {
  productId: string;
  variantId: string | null;
  slug: string;
  category: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
};

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
  ) => void;
  removeItem: (productId: string, variantId: string | null) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const EMPTY_CART: CartItem[] = [];
const cartListeners = new Set<() => void>();
let cartItems: CartItem[] = EMPTY_CART;
let cartInitialized = false;
let storageListening = false;

function itemKey(item: Pick<CartItem, "productId" | "variantId">) {
  return `${item.productId}:${item.variantId ?? "default"}`;
}

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
    item.quantity > 0
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
        const key = itemKey(item);
        const existing = current.find((entry) => itemKey(entry) === key);
        if (!existing) return [...current, { ...item, quantity: safeQuantity }];
        return current.map((entry) =>
          itemKey(entry) === key
            ? {
                ...entry,
                ...item,
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
    (productId: string, variantId: string | null, quantity: number) => {
      if (quantity <= 0) {
        changeCart((current) =>
          current.filter(
            (item) => itemKey(item) !== itemKey({ productId, variantId }),
          ),
        );
        return;
      }
      const safeQuantity = Math.min(
        Math.max(1, Math.floor(quantity)),
        MAX_CART_QUANTITY,
      );
      changeCart((current) =>
        current.map((item) =>
          itemKey(item) === itemKey({ productId, variantId })
            ? { ...item, quantity: safeQuantity }
            : item,
        ),
      );
    },
    [],
  );

  const removeItem = useCallback(
    (productId: string, variantId: string | null) => {
      changeCart((current) =>
        current.filter(
          (item) => itemKey(item) !== itemKey({ productId, variantId }),
        ),
      );
    },
    [],
  );

  const clearCart = useCallback(() => changeCart(() => EMPTY_CART), []);
  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const subtotal = items.reduce(
    (total, item) => total + item.unitPrice * item.quantity,
    0,
  );
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
