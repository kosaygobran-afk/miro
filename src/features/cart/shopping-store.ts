import { cartConfigurationKey, type CartItem } from "./cart-items";
import {
  EMPTY_SHOPPING,
  type ShoppingAccount,
  type ShoppingData,
  type ShoppingOperation,
} from "./shopping-types";
import { ACCOUNT_SESSION_REFRESH_EVENT } from "@/lib/account-session";

const CART_STORAGE_KEY = "miro-cart-v1";
const WISHLIST_STORAGE_KEY = "miro-wishlist-v1";
const GUEST_ID_KEY = "miro-guest-shopping-id";
const SHOPPING_URL = "/api/account/shopping";
const MAX_CART_QUANTITY = 99;

type ShoppingSnapshot = ShoppingData & {
  hydrated: boolean;
  account: ShoppingAccount | null;
  saving: boolean;
  issue: boolean;
};

const initialSnapshot: ShoppingSnapshot = {
  ...EMPTY_SHOPPING,
  hydrated: false,
  account: null,
  saving: false,
  issue: false,
};
let snapshot = initialSnapshot;
let guest = EMPTY_SHOPPING;
let confirmed = EMPTY_SHOPPING;
let account: ShoppingAccount | null = null;
let queue: ShoppingOperation[] = [];
let reading = false;
let writing = false;
let initialized = false;
let issue = false;
let generation = 0;
let syncAccount = false;
let listening = false;
const listeners = new Set<() => void>();

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

function readLocal(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Guest shopping still works in memory when browser storage is disabled.
  }
}

function parseLocal(key: string): unknown {
  try {
    return JSON.parse(readLocal(key) ?? "null");
  } catch {
    return null;
  }
}

function readCart(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(isCartItem).map((item) => ({
    ...item,
    quantity: Math.min(item.quantity, MAX_CART_QUANTITY),
  }));
}

function readWishlist(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter(
        (id): id is string =>
          typeof id === "string" &&
          /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id),
      ),
    ),
  ];
}

function readGuest() {
  return {
    cart: readCart(parseLocal(CART_STORAGE_KEY)),
    wishlist: readWishlist(parseLocal(WISHLIST_STORAGE_KEY)),
  };
}

function pendingKey(owner: string) {
  return `miro-shopping-pending:${owner}`;
}

function readPending(owner: string): ShoppingOperation[] {
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(pendingKey(owner)) ?? "[]",
    );
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function persistPending() {
  if (!account) return;
  const key = pendingKey(account.id);
  try {
    const pending = queue.filter((operation) => operation.action !== "import");
    if (pending.length)
      window.sessionStorage.setItem(key, JSON.stringify(pending));
    else window.sessionStorage.removeItem(key);
  } catch {
    // The live queue can still retry when session storage is disabled.
  }
}

function adjustWishlist(wishlist: string[], productId: string, saved: boolean) {
  return saved
    ? [productId, ...wishlist.filter((id) => id !== productId)]
    : wishlist.filter((id) => id !== productId);
}

function applyOperation(
  data: ShoppingData,
  operation: ShoppingOperation,
): ShoppingData {
  if (operation.action === "wishlist") {
    return {
      ...data,
      wishlist: adjustWishlist(
        data.wishlist,
        operation.productId,
        operation.saved,
      ),
    };
  }
  if (operation.action === "import") return data;
  const cart = new Map(
    data.cart.map((item) => [cartConfigurationKey(item), item]),
  );
  for (const { key, item } of operation.changes) {
    if (item) cart.set(key, item);
    else cart.delete(key);
  }
  return { ...data, cart: [...cart.values()] };
}

function publish() {
  const data = account ? queue.reduce(applyOperation, confirmed) : guest;
  const importing = queue[0]?.action === "import";
  snapshot = {
    ...data,
    account,
    hydrated: initialized && !importing,
    saving: writing || queue.length > 0,
    issue,
  };
  for (const listener of listeners) listener();
}

function guestImport(): ShoppingOperation | null {
  if (!guest.cart.length && !guest.wishlist.length) return null;
  let id = readLocal(GUEST_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    writeLocal(GUEST_ID_KEY, id);
  }
  return { action: "import", id, data: guest };
}

function enqueueImport() {
  const operation = guestImport();
  if (operation) queue.push(operation);
}

function responseData(body: { data?: ShoppingData }): ShoppingData {
  if (!Array.isArray(body.data?.cart) || !Array.isArray(body.data.wishlist)) {
    throw new Error("Invalid shopping response");
  }
  return {
    cart: readCart(body.data.cart),
    wishlist: readWishlist(body.data.wishlist),
  };
}

async function saveQueue() {
  if (writing || !account || !queue.length || issue) return;
  const owner = account.id;
  const epoch = generation;
  writing = true;
  publish();
  try {
    while (queue.length && epoch === generation) {
      const operation = queue[0];
      const response = await fetch(SHOPPING_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, operation }),
        signal: AbortSignal.timeout(20_000),
      });
      if (epoch !== generation) return;
      if (response.status === 401) {
        resetAccount(false);
        return;
      }
      if (!response.ok) throw new Error("Shopping update failed");
      const result = responseData(await response.json());
      if (epoch !== generation) return;
      confirmed = result;
      queue.shift();
      persistPending();
      if (operation.action === "import") {
        const storedId = readLocal(GUEST_ID_KEY);
        if (
          guest === operation.data &&
          (storedId === operation.id || storedId === null)
        ) {
          writeLocal(CART_STORAGE_KEY, null);
          writeLocal(WISHLIST_STORAGE_KEY, null);
          writeLocal(GUEST_ID_KEY, null);
          guest = EMPTY_SHOPPING;
        } else {
          guest = readGuest();
          enqueueImport();
        }
      }
      publish();
    }
  } catch {
    if (epoch === generation) issue = true;
  } finally {
    if (epoch === generation) {
      writing = false;
      publish();
    }
  }
}

export async function refreshShopping() {
  if (!syncAccount || reading || writing || queue.length || issue) return;
  const epoch = generation;
  reading = true;
  try {
    const response = await fetch(SHOPPING_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error("Shopping could not load");
    const result: { account: ShoppingAccount | null; data?: ShoppingData } =
      await response.json();
    if (epoch !== generation) return;
    if (queue.length || writing) return;
    if (result.account === undefined)
      throw new Error("Invalid account response");
    confirmed = result.account ? responseData(result) : EMPTY_SHOPPING;
    const previousOwner = account?.id;
    account = result.account;
    if (account) {
      enqueueImport();
      if (previousOwner !== account.id) queue.push(...readPending(account.id));
    }
    initialized = true;
    publish();
    void saveQueue();
  } catch {
    if (epoch === generation) {
      // Keep browser-owned selections usable while the account read is down.
      // The next successful read still imports them through the normal queue.
      initialized = true;
      issue = true;
      publish();
    }
  } finally {
    if (epoch === generation) reading = false;
  }
}

function resetAccount(discardPending: boolean) {
  generation++;
  reading = false;
  writing = false;
  queue = [];
  if (discardPending) persistPending();
  account = null;
  confirmed = EMPTY_SHOPPING;
  initialized = false;
  issue = false;
  guest = readGuest();
  publish();
  void refreshShopping();
}

function onStorage(event: StorageEvent) {
  if (
    event.key !== CART_STORAGE_KEY &&
    event.key !== WISHLIST_STORAGE_KEY &&
    event.key !== null
  )
    return;
  guest = readGuest();
  if (!account) publish();
}

function onAccountChange() {
  if (syncAccount) resetAccount(true);
}

function onPageShow(event: PageTransitionEvent) {
  if (event.persisted && syncAccount) resetAccount(false);
}

export function subscribeShopping(
  listener: () => void,
  enableAccount: boolean,
) {
  listeners.add(listener);
  if (!listening) {
    listening = true;
    syncAccount = enableAccount;
    guest = readGuest();
    initialized = !syncAccount;
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refreshShopping);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener(ACCOUNT_SESSION_REFRESH_EVENT, onAccountChange);
    // Publish after React attaches this subscription.
    queueMicrotask(() => {
      publish();
      void refreshShopping();
    });
  }
  return () => {
    listeners.delete(listener);
    // Shopping state and pending saves span locale layout replacements.
  };
}

export function getShoppingSnapshot() {
  return snapshot;
}

export function getServerShoppingSnapshot() {
  return initialSnapshot;
}

export function retryShopping() {
  issue = false;
  publish();
  if (queue.length) void saveQueue();
  else void refreshShopping();
}

export function changeCart(update: (current: CartItem[]) => CartItem[]) {
  if (!snapshot.hydrated) return false;
  const cart = update(snapshot.cart);
  if (account) {
    const previous = new Map(
      snapshot.cart.map((item) => [cartConfigurationKey(item), item]),
    );
    const changes: { key: string; item: CartItem | null }[] = [];
    for (const item of cart) {
      const key = cartConfigurationKey(item);
      if (previous.get(key) !== item) changes.push({ key, item });
      previous.delete(key);
    }
    for (const key of previous.keys()) changes.push({ key, item: null });
    if (!changes.length) return true;
    queue.push({ action: "cart", changes });
    persistPending();
  } else {
    guest = { ...guest, cart };
    writeLocal(GUEST_ID_KEY, crypto.randomUUID());
    writeLocal(CART_STORAGE_KEY, JSON.stringify(cart));
  }
  publish();
  void saveQueue();
  return true;
}

export function setWishlisted(productId: string, saved: boolean) {
  if (!snapshot.hydrated) return;
  if (account) {
    queue.push({ action: "wishlist", productId, saved });
    persistPending();
  } else {
    guest = {
      ...guest,
      wishlist: adjustWishlist(guest.wishlist, productId, saved),
    };
    writeLocal(GUEST_ID_KEY, crypto.randomUUID());
    writeLocal(WISHLIST_STORAGE_KEY, JSON.stringify(guest.wishlist));
  }
  publish();
  void saveQueue();
}
