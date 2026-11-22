import type { CartItem } from "./cart-items";

export type ShoppingData = {
  cart: CartItem[];
  wishlist: string[];
};

export type ShoppingOperation =
  | { action: "cart"; changes: { key: string; item: CartItem | null }[] }
  | { action: "wishlist"; productId: string; saved: boolean }
  | { action: "import"; id: string; data: ShoppingData };

export type ShoppingAccount = {
  id: string;
  contact: { name: string; email: string; phone: string };
};

export const EMPTY_SHOPPING: ShoppingData = { cart: [], wishlist: [] };
