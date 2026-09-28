"use client";

import { useState } from "react";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { DetailPanel, Drawer, Notice, StatusBadge } from "../ui";
import { requestDrawerCopy as copy, requestStatusLabels } from "./copy";
import {
  REQUEST_STATUSES,
  type RequestStatus,
  type ServiceRequestRow,
  type StaffMember,
} from "./types";
import styles from "./requests-queue.module.css";

function isRequestStatus(status: string): status is RequestStatus {
  return (REQUEST_STATUSES as readonly string[]).includes(status);
}

export function whatsappHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Israeli local numbers (05x…) dial internationally without the leading 0.
  const intl = digits.startsWith("0") ? `972${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}

export function formatReceived(
  iso: string,
  locale: "he" | "en",
): { text: string; dateTime: string } {
  return {
    dateTime: iso,
    text: new Date(iso).toLocaleString(locale === "he" ? "he-IL" : "en-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

type RequestDrawerProps = {
  open: boolean;
  request: ServiceRequestRow | null;
  staff: StaffMember[];
  selfId: string;
  selfName: string;
  locale: "he" | "en";
  onClose: () => void;
  onUpdated: (
    id: string,
    patch: {
      status: string;
      assignedTo: { id: string; displayName: string | null } | null;
    },
  ) => void;
};

export function RequestDrawer({
  open,
  request,
  staff,
  selfId,
  selfName,
  locale,
  onClose,
  onUpdated,
}: RequestDrawerProps) {
  const he = locale === "he";
  const t = (map: Record<"he" | "en", string>) => map[locale];
  const copyMap = copy;

  const [assignedToId, setAssignedToId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "danger";
    text: string;
  } | null>(null);

  // Reset the assignment select during render when a different request is
  // opened (React-sanctioned derived-state reset; avoids setState-in-effect).
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  if (request && request.id !== lastRequestId) {
    setLastRequestId(request.id);
    setAssignedToId(request.assignedTo?.id ?? "");
    setNotice(null);
  }

  if (!request) return null;

  const statusLabel = (status: string): string =>
    isRequestStatus(status) ? requestStatusLabels[status][locale] : status;

  const staffName = (id: string): string => {
    if (id === selfId) return selfName || t(copyMap.meSuffix);
    return (
      staff.find((member) => member.id === id)?.name || t(copyMap.unknownStaff)
    );
  };

  async function patch(update: {
    status?: RequestStatus;
    assignedTo?: string;
  }): Promise<void> {
    if (busy || !request) return;
    setBusy(true);
    setNotice(null);
    const nextStatus = update.status ?? request.status;
    const nextAssignee =
      update.assignedTo !== undefined
        ? update.assignedTo || null
        : assignedToId || null;
    try {
      const res = await fetch("/api/management/requests", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: request.id,
          status: nextStatus,
          assignedTo: nextAssignee,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({
          tone: "danger",
          text:
            typeof data?.error === "string" && data.error
              ? data.error
              : t(copyMap.saveError),
        });
        return;
      }
      onUpdated(request.id, {
        status: nextStatus,
        assignedTo: nextAssignee
          ? { id: nextAssignee, displayName: staffName(nextAssignee) }
          : null,
      });
      setNotice({ tone: "success", text: t(copyMap.saveSuccess) });
    } catch {
      setNotice({ tone: "danger", text: t(copyMap.saveError) });
    } finally {
      setBusy(false);
    }
  }

  const received = formatReceived(request.created_at, locale);
  const productName = request.product
    ? he
      ? request.product.name_he
      : request.product.name_en
    : null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={request.customer.name || t(copyMap.detailsTitle)}
      side="start"
      closeLabel={t(copyMap.closeLabel)}
    >
      <div className={styles.drawerSection}>
        <h3 className={styles.drawerSectionTitle}>{t(copyMap.contactTitle)}</h3>
        <div className={styles.contactCard}>
          <span className={styles.contactName} dir="auto">
            {request.customer.name}
          </span>
          {request.customer.phone ? (
            <span dir="ltr">{request.customer.phone}</span>
          ) : null}
          <span dir="ltr">{request.customer.email}</span>
          <div className={styles.contactActions}>
            {request.customer.phone ? (
              <a
                className={styles.contactAction}
                href={`tel:${request.customer.phone}`}
              >
                <Phone size={14} aria-hidden="true" />
                {t(copyMap.callAction)}
              </a>
            ) : null}
            <a
              className={styles.contactAction}
              href={`mailto:${request.customer.email}`}
            >
              <Mail size={14} aria-hidden="true" />
              {t(copyMap.emailAction)}
            </a>
            {request.customer.phone ? (
              <a
                className={styles.contactAction}
                href={whatsappHref(request.customer.phone)}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={14} aria-hidden="true" />
                {t(copyMap.whatsappAction)}
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.drawerSection}>
        <DetailPanel
          title={t(copyMap.detailsTitle)}
          rows={[
            {
              label: t(copyMap.receivedRow),
              value: (
                <time dateTime={received.dateTime} dir="ltr">
                  {received.text}
                </time>
              ),
            },
            { label: t(copyMap.sourceRow), value: request.source || "—" },
            { label: t(copyMap.localeRow), value: request.locale ?? "—" },
            {
              label: t(copyMap.requestIdRow),
              value: (
                <span dir="ltr" className={styles.productMeta}>
                  {request.id}
                </span>
              ),
            },
            {
              label: t(copyMap.customerAccountRow),
              value: request.customer.id
                ? t(copyMap.linkedYes)
                : t(copyMap.linkedNo),
            },
          ]}
        />
      </div>

      {request.product ? (
        <div className={styles.drawerSection}>
          <h3 className={styles.drawerSectionTitle}>
            {t(copyMap.productTitle)}
          </h3>
          <div className={styles.productCard}>
            <span className={styles.productName} dir="auto">
              {productName}
            </span>
            {request.variant ? (
              <span className={styles.productMeta}>
                <span dir="ltr">SKU: {request.variant.sku}</span>
                {request.variant.color_he || request.variant.color_en
                  ? ` · ${he ? request.variant.color_he : request.variant.color_en}`
                  : ""}
              </span>
            ) : null}
            <a
              className={styles.productLink}
              href={`/${locale}/admin/products`}
            >
              {t(copyMap.openProductEditor)} →
            </a>
          </div>
        </div>
      ) : null}

      <div className={styles.drawerSection}>
        <h3 className={styles.drawerSectionTitle}>{t(copyMap.messageTitle)}</h3>
        <p className={styles.messageBox} dir="auto">
          {request.message}
        </p>
      </div>

      <div className={styles.drawerSection}>
        <h3 className={styles.drawerSectionTitle}>
          {t(copyMap.assignmentTitle)}
        </h3>
        <div className={styles.selectWrap}>
          <label className={styles.selectLabel} htmlFor="request-assignee">
            {t(copyMap.assignmentLabel)}
          </label>
          <select
            id="request-assignee"
            className={styles.select}
            value={assignedToId}
            disabled={busy}
            onChange={(event) => {
              setAssignedToId(event.target.value);
              void patch({ assignedTo: event.target.value });
            }}
          >
            <option value="">{t(copyMap.unassignedOption)}</option>
            <option
              value={selfId}
            >{`${selfName || t(copyMap.unassignedOption)} (${t(copyMap.meSuffix)})`}</option>
            {staff
              .filter((member) => member.id !== selfId)
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className={styles.drawerSection}>
        <h3 className={styles.drawerSectionTitle}>
          {t(copyMap.statusActionsTitle)}
        </h3>
        <div className={styles.statusActions} role="group">
          {REQUEST_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className={styles.statusAction}
              data-active={request.status === status || undefined}
              disabled={busy || request.status === status}
              onClick={() => void patch({ status })}
            >
              {statusLabel(status)}
            </button>
          ))}
        </div>
      </div>

      {notice ? (
        <Notice tone={notice.tone === "danger" ? "danger" : "success"}>
          {notice.text}
        </Notice>
      ) : null}

      <div className={styles.drawerSection}>
        <StatusBadge status={request.status}>
          {statusLabel(request.status)}
        </StatusBadge>
      </div>
    </Drawer>
  );
}
