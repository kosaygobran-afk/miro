"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Inbox, X } from "lucide-react";
import {
  DataTable,
  DateRangePicker,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Notice,
  PageHeader,
  StatusBadge,
  Toolbar,
  dateRangeLabels,
  resolveDateRange,
  type DateRangeValue,
} from "../ui";
import { requestsQueueCopy as copy, requestStatusLabels } from "./copy";
import { RequestDrawer, formatReceived, whatsappHref } from "./request-drawer";
import {
  REQUEST_STATUSES,
  type ProductFilterOption,
  type RequestStatus,
  type ServiceRequestRow,
  type StaffMember,
} from "./types";
import styles from "./requests-queue.module.css";

const PAGE_SIZE = 25;
const STALE_AFTER_HOURS = 48;

function isRequestStatus(status: string): status is RequestStatus {
  return (REQUEST_STATUSES as readonly string[]).includes(status);
}

function toFromIso(date: string): string {
  return new Date(`${date}T00:00:00`).toISOString();
}

function toToIso(date: string): string {
  return new Date(`${date}T23:59:59.999`).toISOString();
}

function ageText(ageMs: number, locale: "he" | "en"): string {
  const hours = ageMs / 3_600_000;
  const days = Math.max(1, Math.floor(hours / 24));
  return locale === "he"
    ? `${days} ${copy.ageDays.he}`
    : `${days}${copy.ageDays.en}`;
}

/* ---------- Product filter combobox (debounced against the products API) ---------- */

type ProductFilterProps = {
  locale: "he" | "en";
  value: ProductFilterOption | null;
  onChange: (option: ProductFilterOption | null) => void;
};

function ProductFilter({ locale, value, onChange }: ProductFilterProps) {
  const he = locale === "he";
  const t = (map: Record<"he" | "en", string>) => map[locale];
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ProductFilterOption[]>([]);
  const [fetching, setFetching] = useState(false);
  const cacheRef = useRef(new Map<string, ProductFilterOption[]>());

  useEffect(() => {
    if (value) return;
    const handle = setTimeout(() => {
      const term = input.trim();
      const cached = cacheRef.current.get(term);
      if (cached) {
        setOptions(cached);
        return;
      }
      setFetching(true);
      fetch(`/api/management/products?q=${encodeURIComponent(term)}&limit=20`, {
        cache: "no-store",
      })
        .then((res) => (res.ok ? res.json() : { products: [] }))
        .then((data) => {
          const needle = term.toLowerCase();
          const list = (
            (data.products ?? []) as Array<{
              id: string;
              name_he: string;
              name_en: string;
            }>
          )
            .filter(
              (product) =>
                !needle ||
                product.name_he.toLowerCase().includes(needle) ||
                product.name_en.toLowerCase().includes(needle),
            )
            .slice(0, 20)
            .map((product) => ({
              id: product.id,
              name_he: product.name_he,
              name_en: product.name_en,
            }));
          cacheRef.current.set(term, list);
          setOptions(list);
          setFetching(false);
        })
        .catch(() => setFetching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [input, value]);

  if (value) {
    return (
      <span className={styles.comboSelected}>
        <span dir="auto">{he ? value.name_he : value.name_en}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={t(copy.productClear)}
        >
          <X size={13} aria-hidden="true" />
        </button>
      </span>
    );
  }

  return (
    <div
      className={styles.combo}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <label className={styles.selectLabel} htmlFor="rq-product-filter">
        {t(copy.productLabel)}
      </label>
      <input
        id="rq-product-filter"
        className={styles.input}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls="rq-product-options"
        autoComplete="off"
        value={input}
        placeholder={t(copy.productSearchPlaceholder)}
        onChange={(event) => {
          setInput(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open ? (
        <ul
          className={styles.comboList}
          role="listbox"
          id="rq-product-options"
          aria-label={t(copy.productLabel)}
        >
          {fetching ? (
            <li className={styles.comboStatus}>{t(copy.productLoading)}</li>
          ) : options.length === 0 ? (
            <li className={styles.comboStatus}>{t(copy.productNoResults)}</li>
          ) : (
            options.map((option) => (
              <li key={option.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  className={styles.comboOption}
                  onClick={() => {
                    onChange(option);
                    setInput("");
                    setOpen(false);
                  }}
                >
                  <span dir="auto">{he ? option.name_he : option.name_en}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/* ---------- Request work queue ---------- */

export function RequestsQueue({
  locale,
  selfId,
  selfName,
}: {
  locale: "he" | "en";
  selfId: string;
  selfName: string;
}) {
  const he = locale === "he";
  const t = (map: Record<"he" | "en", string>) => map[locale];

  // Filters
  const [statusTab, setStatusTab] = useState<"all" | RequestStatus>("all");
  const [assigned, setAssigned] = useState("any");
  const [source, setSource] = useState("");
  const [localeFilter, setLocaleFilter] = useState("");
  const [productOption, setProductOption] =
    useState<ProductFilterOption | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeValue | null>(null);

  // Data
  const [rows, setRows] = useState<ServiceRequestRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [resolvedKey, setResolvedKey] = useState("");
  // Snapshot of "now" taken when the list resolves (async fetch callback, so
  // it stays out of render and satisfy react-hooks/purity).
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [knownSources, setKnownSources] = useState<string[]>([]);

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffError, setStaffError] = useState("");

  const [selected, setSelected] = useState<ServiceRequestRow | null>(null);

  // Debounce the free-text search into the request params.
  useEffect(() => {
    const handle = setTimeout(() => {
      setQ(searchInput.trim());
      setOffset(0);
    }, 400);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // A fetch key doubles as the loading signal: while the resolved key lags
  // the current one, the queue is (re)loading — no setState in the effect body.
  const fetchKey = useMemo(
    () =>
      JSON.stringify([
        statusTab,
        assigned,
        source,
        localeFilter,
        productOption?.id ?? "",
        q,
        dateRange?.from ?? "",
        dateRange?.to ?? "",
        offset,
        reloadKey,
      ]),
    [
      statusTab,
      assigned,
      source,
      localeFilter,
      productOption,
      q,
      dateRange,
      offset,
      reloadKey,
    ],
  );
  const loading = resolvedKey !== fetchKey;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("status", statusTab);
    params.set("assigned", assigned);
    if (source) params.set("source", source);
    if (productOption) params.set("productId", productOption.id);
    if (localeFilter) params.set("locale", localeFilter);
    if (q) params.set("q", q);
    if (dateRange?.from) params.set("dateFrom", toFromIso(dateRange.from));
    if (dateRange?.to) params.set("dateTo", toToIso(dateRange.to));
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));

    fetch(`/api/management/requests?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!res.ok) {
          setError(
            typeof data?.error === "string" && data.error
              ? data.error
              : copy.errorTitle[locale],
          );
          setRows([]);
          setTotalCount(0);
          setResolvedKey(fetchKey);
          return;
        }
        setError("");
        setRows((data.rows ?? []) as ServiceRequestRow[]);
        setTotalCount(
          typeof data.totalCount === "number" ? data.totalCount : 0,
        );
        setResolvedKey(fetchKey);
        setLoadedAt(Date.now());
        const seen = ((data.rows ?? []) as ServiceRequestRow[])
          .map((row) => row.source)
          .filter(Boolean);
        if (seen.length > 0) {
          setKnownSources((prev) => [...new Set([...prev, ...seen])]);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(copy.errorTitle[locale]);
          setResolvedKey(fetchKey);
        }
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchKey fully encodes every parameter used here
  }, [fetchKey, locale]);

  // Staff directory for the assignee filter and the drawer (one bounded
  // listing per assignable role; the users API accepts a single role value).
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(
      (["worker", "admin", "ceo"] as const).map((role) =>
        fetch(`/api/management/users?role=${role}&limit=100`, {
          cache: "no-store",
          signal: controller.signal,
        })
          .then((res) => (res.ok ? res.json() : { users: [] }))
          .then((data) =>
            Array.isArray(data.users) ? (data.users as StaffMember[]) : [],
          ),
      ),
    )
      .then((lists) => {
        if (controller.signal.aborted) return;
        const byId = new Map<string, StaffMember>();
        for (const list of lists) {
          for (const user of list) {
            if (!byId.has(user.id)) {
              byId.set(user.id, {
                id: user.id,
                // The users API returns full_name; keep profile-ready fallbacks.
                name:
                  (user as unknown as { full_name?: string }).full_name ||
                  user.name ||
                  user.email ||
                  user.id.slice(0, 8),
                email: user.email ?? "",
                role: user.role,
              });
            }
          }
        }
        setStaff([...byId.values()]);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStaffError(copy.staffError[locale]);
        }
      });
    return () => controller.abort();
  }, [locale]);

  const setFilter = (setter: () => void) => {
    setter();
    setOffset(0);
  };

  const applyRowUpdate = (
    id: string,
    patch: {
      status: string;
      assignedTo: { id: string; displayName: string | null } | null;
    },
  ) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
    setSelected((prev) =>
      prev && prev.id === id ? { ...prev, ...patch } : prev,
    );
  };

  const statusLabel = (status: string): string =>
    isRequestStatus(status) ? requestStatusLabels[status][locale] : status;

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const showSkeleton = loading && rows.length === 0 && !error;

  return (
    <section>
      <PageHeader title={t(copy.pageTitle)} subtitle={t(copy.pageSubtitle)} />

      <Toolbar
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder={t(copy.searchPlaceholder)}
        searchLabel={t(copy.searchLabel)}
      >
        <div className={styles.filtersRow}>
          <div
            className={styles.statusTabs}
            role="group"
            aria-label={t(copy.statusFilterLabel)}
          >
            <button
              type="button"
              className={styles.statusTab}
              aria-pressed={statusTab === "all"}
              onClick={() => setFilter(() => setStatusTab("all"))}
            >
              {t(copy.statusAll)}
            </button>
            {REQUEST_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                className={styles.statusTab}
                aria-pressed={statusTab === status}
                onClick={() => setFilter(() => setStatusTab(status))}
              >
                {statusLabel(status)}
              </button>
            ))}
          </div>

          <div className={styles.selectWrap}>
            <label className={styles.selectLabel} htmlFor="rq-assignee">
              {t(copy.assigneeLabel)}
            </label>
            <select
              id="rq-assignee"
              className={styles.select}
              value={assigned}
              onChange={(event) =>
                setFilter(() => setAssigned(event.target.value))
              }
            >
              <option value="any">{t(copy.assigneeAny)}</option>
              <option value="unassigned">{t(copy.assigneeUnassigned)}</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.selectWrap}>
            <label className={styles.selectLabel} htmlFor="rq-source">
              {t(copy.sourceLabel)}
            </label>
            <select
              id="rq-source"
              className={styles.select}
              value={source}
              onChange={(event) =>
                setFilter(() => setSource(event.target.value))
              }
            >
              <option value="">{t(copy.sourceAny)}</option>
              {knownSources.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.selectWrap}>
            <label className={styles.selectLabel} htmlFor="rq-locale">
              {t(copy.localeLabel)}
            </label>
            <select
              id="rq-locale"
              className={styles.select}
              value={localeFilter}
              onChange={(event) =>
                setFilter(() => setLocaleFilter(event.target.value))
              }
            >
              <option value="">{t(copy.localeAny)}</option>
              <option value="he">עברית</option>
              <option value="en">English</option>
            </select>
          </div>

          <ProductFilter
            locale={locale}
            value={productOption}
            onChange={(option) => setFilter(() => setProductOption(option))}
          />

          <button
            type="button"
            className={styles.toggleButton}
            aria-pressed={dateRange !== null}
            onClick={() =>
              setFilter(() =>
                setDateRange((prev) =>
                  prev
                    ? null
                    : { preset: "last7", ...resolveDateRange("last7") },
                ),
              )
            }
          >
            {t(copy.dateFilterToggle)}
          </button>
        </div>
      </Toolbar>

      {dateRange ? (
        <div className={styles.dateFilterPanel}>
          <DateRangePicker
            value={dateRange}
            onChange={(next) => setFilter(() => setDateRange(next))}
            labels={dateRangeLabels(locale)}
          />
          <button
            type="button"
            className={styles.toggleButton}
            onClick={() => setFilter(() => setDateRange(null))}
          >
            {t(copy.dateFilterClear)}
          </button>
        </div>
      ) : null}

      {staffError ? <Notice tone="warning">{staffError}</Notice> : null}

      {error ? (
        <ErrorState
          title={copy.errorTitle[locale]}
          description={error === copy.errorTitle[locale] ? undefined : error}
          onRetry={() => setReloadKey((key) => key + 1)}
          retryLabel={t(copy.errorRetry)}
        />
      ) : showSkeleton ? (
        <ListSkeleton rows={6} />
      ) : (
        <>
          <div aria-busy={loading}>
            <DataTable
              caption={t(copy.tableCaption)}
              minWidth="56rem"
              isEmpty={rows.length === 0}
              emptyState={
                <EmptyState
                  icon={<Inbox size={22} aria-hidden="true" />}
                  title={t(copy.emptyTitle)}
                  description={t(copy.emptyDescription)}
                />
              }
              head={
                <tr>
                  <th scope="col">{t(copy.colContact)}</th>
                  <th scope="col">{t(copy.colProduct)}</th>
                  <th scope="col">{t(copy.colReceived)}</th>
                  <th scope="col">{t(copy.colStatus)}</th>
                  <th scope="col">{t(copy.colAssignee)}</th>
                  <th scope="col" aria-label={t(copy.colOpen)} />
                </tr>
              }
            >
              {rows.map((row) => {
                const received = formatReceived(row.created_at, locale);
                const ageMs =
                  loadedAt === null
                    ? 0
                    : loadedAt - new Date(row.created_at).getTime();
                const stale =
                  row.status === "new" &&
                  loadedAt !== null &&
                  ageMs >= STALE_AFTER_HOURS * 3_600_000;
                const productName = row.product
                  ? he
                    ? row.product.name_he
                    : row.product.name_en
                  : null;
                return (
                  <tr key={row.id}>
                    <td>
                      <div className={styles.contactCell}>
                        <span className={styles.contactName} dir="auto">
                          {row.customer.name}
                        </span>
                        <span className={styles.contactLinks}>
                          {row.customer.phone ? (
                            <a href={`tel:${row.customer.phone}`} dir="ltr">
                              {row.customer.phone}
                            </a>
                          ) : null}
                          <a href={`mailto:${row.customer.email}`} dir="ltr">
                            {row.customer.email}
                          </a>
                          {row.customer.phone ? (
                            <a
                              href={whatsappHref(row.customer.phone)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t(copy.whatsappAction)}
                            </a>
                          ) : null}
                        </span>
                      </div>
                    </td>
                    <td>
                      {productName ? (
                        <>
                          <span dir="auto">{productName}</span>
                          {row.variant ? (
                            <>
                              {" "}
                              <span className={styles.productMeta} dir="ltr">
                                {row.variant.sku}
                              </span>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <span className={styles.productMeta}>
                          {t(copy.noProduct)}
                        </span>
                      )}
                    </td>
                    <td>
                      <time dateTime={received.dateTime} dir="ltr">
                        {received.text}
                      </time>
                      {stale ? (
                        <span className={styles.ageBadge}>
                          {ageText(ageMs, locale)}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <StatusBadge status={row.status}>
                        {statusLabel(row.status)}
                      </StatusBadge>
                    </td>
                    <td>
                      {row.assignedTo ? (
                        <span dir="auto">
                          {row.assignedTo.id === selfId
                            ? selfName || row.assignedTo.displayName
                            : (row.assignedTo.displayName ??
                              t(copy.assigneeUnassigned))}
                        </span>
                      ) : (
                        <span className={styles.productMeta}>
                          {t(copy.unassignedShort)}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.rowChevron}
                        aria-label={t(copy.openDetails)}
                        onClick={() => setSelected(row)}
                      >
                        <ChevronLeft size={16} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          </div>

          {totalCount > 0 ? (
            <div className={styles.pagination}>
              <p className={styles.paginationInfo} aria-live="polite">
                {`${totalCount} ${t(copy.resultsCount)} · ${page} ${t(copy.paginationOf)} ${pages}`}
              </p>
              <div className={styles.paginationButtons}>
                <button
                  type="button"
                  className="mgmt-button mgmt-button--ghost"
                  disabled={loading || offset === 0}
                  onClick={() =>
                    setOffset((prev) => Math.max(0, prev - PAGE_SIZE))
                  }
                >
                  {t(copy.prevPage)}
                </button>
                <button
                  type="button"
                  className="mgmt-button mgmt-button--ghost"
                  disabled={loading || offset + PAGE_SIZE >= totalCount}
                  onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                >
                  {t(copy.nextPage)}
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <RequestDrawer
        open={selected !== null}
        request={selected}
        staff={staff}
        selfId={selfId}
        selfName={selfName}
        locale={locale}
        onClose={() => setSelected(null)}
        onUpdated={applyRowUpdate}
      />
    </section>
  );
}
