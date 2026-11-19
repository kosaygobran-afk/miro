"use client";

import { ArrowLeft, ArrowRight, Package, Search } from "lucide-react";
import Image from "next/image";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "@/components/motion/motion-link";
import { beginNavigation } from "@/components/motion/navigation-events";
import { withLocale, type Locale } from "@/lib/i18n";
import {
  PRODUCT_SEARCH_LIMIT,
  PRODUCT_SEARCH_QUERY_MAX_LENGTH,
  type ProductSearchItem,
  type ProductSearchPage,
} from "@/lib/catalog/product-search";
import styles from "./navbar-product-search.module.css";

const copy = {
  en: {
    store: "Search the store",
    placeholder: "Name, brand, SKU or barcode",
    search: "Search",
    results: "Product search results",
    previous: "Previous products",
    next: "Next products",
    loading: "Searching products…",
    empty: "No matching products.",
    unavailable: "Product search is temporarily unavailable.",
    retry: "Try again",
    range: (start: number, end: number) => `Products ${start}–${end}`,
    sku: "SKU",
    barcode: "Barcode",
  },
  he: {
    store: "חיפוש בחנות",
    placeholder: "שם, מותג, מק״ט או ברקוד",
    search: "חיפוש",
    results: "תוצאות חיפוש מוצרים",
    previous: "מוצרים קודמים",
    next: "מוצרים נוספים",
    loading: "מחפש מוצרים…",
    empty: "לא נמצאו מוצרים מתאימים.",
    unavailable: "חיפוש המוצרים אינו זמין כרגע.",
    retry: "ניסיון נוסף",
    range: (start: number, end: number) => `מוצרים ${start}–${end}`,
    sku: "מק״ט",
    barcode: "ברקוד",
  },
};

type SearchResponse = {
  key: string;
  data: ProductSearchPage | null;
};

function ProductThumbnail({ src }: { src: string | null }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const safeSrc = src && (/^https:\/\//i.test(src) || /^\/[^/\\]/.test(src));
  return (
    <span className={styles.thumbnail} aria-hidden="true">
      {safeSrc && src !== failedSrc ? (
        <Image
          src={src}
          alt=""
          width={44}
          height={44}
          unoptimized
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <Package size={19} />
      )}
    </span>
  );
}

function SearchResult({
  item,
  labels,
  onNavigate,
}: {
  item: ProductSearchItem;
  labels: (typeof copy)[Locale];
  onNavigate: () => void;
}) {
  return (
    <li>
      <Link
        href={item.href}
        prefetch={false}
        className={styles.result}
        onNavigate={onNavigate}
      >
        <ProductThumbnail src={item.imageUrl} />
        <span className={styles.details}>
          <strong dir="auto" title={item.name}>
            {item.name}
          </strong>
          <span className={styles.metadata}>
            {item.brand && <bdi title={item.brand}>{item.brand}</bdi>}
            {item.model && <bdi title={item.model}>{item.model}</bdi>}
            {item.sku && (
              <span title={item.sku}>
                {labels.sku} <bdi dir="ltr">{item.sku}</bdi>
              </span>
            )}
            {item.barcode && (
              <span title={item.barcode}>
                {labels.barcode} <bdi dir="ltr">{item.barcode}</bdi>
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function NavbarProductSearch({
  locale,
  className,
  onNavigate,
}: {
  locale: Locale;
  className?: string;
  onNavigate?: () => void;
}) {
  const [value, setValue] = useState("");
  const [cursors, setCursors] = useState<Array<string | null>>([]);
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const productListRef = useRef<HTMLUListElement>(null);
  const panelId = useId();
  const labels = copy[locale];
  const storefront = withLocale(locale);
  const query = value.trim();
  const page = cursors.length + 1;
  const cursor = cursors.at(-1);
  const popup = open && Boolean(query) && !composing;
  const requestKey = JSON.stringify([locale, query, page, cursor, attempt]);
  const current = response?.key === requestKey ? response : null;
  const data = current?.data;
  const loading = popup && !current;

  useEffect(() => {
    if (!popup) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      q: query,
      locale,
      page: String(page),
    });
    if (cursor) params.set("cursor", cursor);

    const timer = window.setTimeout(
      async () => {
        try {
          const result = await fetch(`/api/catalog/product-search?${params}`, {
            signal: controller.signal,
            cache: "no-store",
          });
          if (!result.ok) throw new Error("Product search unavailable");
          const data: ProductSearchPage = await result.json();
          if (!controller.signal.aborted)
            setResponse({ key: requestKey, data });
        } catch {
          if (!controller.signal.aborted)
            setResponse({ key: requestKey, data: null });
        }
      },
      page === 1 ? 220 : 0,
    );

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cursor, locale, page, popup, query, requestKey]);

  useEffect(() => {
    if (!popup) return;
    function dismissOutside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !formRef.current?.contains(event.target)
      ) {
        setOpen(false);
        setResponse(null);
      }
    }
    document.addEventListener("pointerdown", dismissOutside);
    return () => document.removeEventListener("pointerdown", dismissOutside);
  }, [popup]);

  useLayoutEffect(() => {
    const form = formRef.current;
    const panel = panelRef.current;
    if (!popup || !form || !panel) return;
    function place() {
      if (!form || !panel) return;
      const anchor = form.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportWidth = Math.min(
        document.documentElement.clientWidth,
        viewport?.width ?? window.innerWidth,
      );
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportBottom = viewport
        ? viewport.offsetTop + viewport.height
        : window.innerHeight;
      panel.style.setProperty(
        "--search-panel-width",
        `${viewportWidth - 16}px`,
      );
      const width = panel.offsetWidth;
      const desiredLeft = anchor.left + (anchor.width - width) / 2;
      const clampedLeft = Math.max(
        viewportLeft + 8,
        Math.min(desiredLeft, viewportLeft + viewportWidth - width - 8),
      );
      panel.style.setProperty(
        "--search-panel-offset",
        `${clampedLeft - anchor.left - form.clientLeft}px`,
      );
      panel.style.setProperty(
        "--search-panel-space",
        `${Math.max(112, viewportBottom - anchor.bottom - 16)}px`,
      );
    }
    const observer = new ResizeObserver(place);
    observer.observe(form);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    place();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [popup]);

  useLayoutEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0;
  }, [requestKey]);

  function dismiss() {
    setOpen(false);
    setResponse(null);
  }

  function navigate() {
    setValue("");
    setCursors([]);
    dismiss();
    onNavigate?.();
  }

  function onSearchSubmit(event: FormEvent<HTMLFormElement>) {
    if (composing || !query) {
      event.preventDefault();
      inputRef.current?.focus();
      return;
    }
    // The mobile form lives in a portal that closes here, so its browser
    // default action may be canceled when the form leaves the document.
    event.preventDefault();
    const target = `${storefront}?${new URLSearchParams({ q: query })}#store-items`;
    onNavigate?.();
    beginNavigation(target);
    window.location.assign(new URL(target, window.location.href).href);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (!popup || event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      inputRef.current?.focus({ preventScroll: true });
      dismiss();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const links = Array.from(
      productListRef.current?.querySelectorAll("a") ?? [],
    );
    if (!links.length) return;
    const focused = document.activeElement;
    const index = links.findIndex((link) => link === focused);
    if (index < 0 && focused !== inputRef.current) return;
    event.preventDefault();
    if (event.key === "ArrowDown") {
      links[(index + 1) % links.length].focus();
    } else if (index <= 0) {
      inputRef.current?.focus({ preventScroll: true });
    } else {
      links[index - 1].focus();
    }
  }

  const count = data?.results.length ?? 0;
  const last = (page - 1) * PRODUCT_SEARCH_LIMIT + count;
  const status = loading
    ? labels.loading
    : !data
      ? labels.unavailable
      : count > 0
        ? labels.range(last - count + 1, last)
        : labels.empty;

  return (
    <form
      ref={formRef}
      action={`${storefront}#store-items`}
      method="get"
      role="search"
      aria-label={labels.store}
      className={`${styles.form}${className ? ` ${className}` : ""}`}
      onSubmit={onSearchSubmit}
      onKeyDown={onSearchKeyDown}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          dismiss();
      }}
    >
      <input
        ref={inputRef}
        name="q"
        type="search"
        autoComplete="off"
        dir="auto"
        maxLength={PRODUCT_SEARCH_QUERY_MAX_LENGTH}
        aria-label={labels.store}
        aria-controls={popup ? panelId : undefined}
        placeholder={labels.placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          const nextValue = event.target.value;
          setValue(nextValue);
          if (nextValue.trim() !== query) {
            setCursors([]);
            setResponse(null);
          }
          setOpen(true);
        }}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={() => setComposing(false)}
      />
      <button type="submit" aria-label={labels.search}>
        <Search size={18} aria-hidden="true" />
      </button>
      {popup && (
        <div
          id={panelId}
          ref={panelRef}
          className={styles.panel}
          role="region"
          aria-label={labels.results}
          aria-busy={loading}
        >
          {count > 0 && (
            <ul ref={productListRef} className={styles.results} role="list">
              {data?.results.map((item) => (
                <SearchResult
                  key={item.id}
                  item={item}
                  labels={labels}
                  onNavigate={navigate}
                />
              ))}
            </ul>
          )}
          <div className={styles.footer}>
            <button
              className={styles.prev}
              type="button"
              aria-label={labels.previous}
              title={labels.previous}
              aria-disabled={page === 1 || loading}
              tabIndex={page === 1 || loading ? -1 : 0}
              onClick={() => {
                if (page > 1 && !loading)
                  setCursors((previous) => previous.slice(0, -1));
              }}
            >
              <ArrowLeft size={17} aria-hidden="true" />
            </button>
            <div className={styles.footerText}>
              <p role="status">{status}</p>
              {current && !data && (
                <button
                  className={styles.retry}
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  {labels.retry}
                </button>
              )}
            </div>
            <button
              className={styles.next}
              type="button"
              aria-label={labels.next}
              title={labels.next}
              aria-disabled={!data?.hasMore || loading}
              tabIndex={!data?.hasMore || loading ? -1 : 0}
              onClick={() => {
                if (data?.hasMore && !loading)
                  setCursors((previous) => [
                    ...previous,
                    data.nextCursor ?? null,
                  ]);
              }}
            >
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
