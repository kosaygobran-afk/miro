"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, ArrowUpRight, Lock } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import type { AppRole } from "@/lib/roles";
import { Dialog } from "../ui/dialog";
import { Drawer } from "../ui/drawer";
import { SearchField } from "../ui/search-field";
import { OverflowText } from "../ui/overflow-text";
import { IconAction } from "../ui/icon-action";
import {
  mgmtNavItems,
  mgmtNavItemLabel,
  mgmtNavItemSubtitle,
  mgmtNavSectionLabel,
} from "./nav-config";

const storageKey = "miro.mgmt.density";
let densityFallback: "comfortable" | "compact" = "comfortable";
function subscribe(callback: () => void) {
  window.addEventListener("miro:mgmt-density", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("miro:mgmt-density", callback);
    window.removeEventListener("storage", callback);
  };
}
function readDensity() {
  try {
    return localStorage.getItem(storageKey) === "compact"
      ? "compact"
      : "comfortable";
  } catch {
    return densityFallback;
  }
}

function chooseDensity(value: "comfortable" | "compact") {
  densityFallback = value;
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    /* The choice still applies during this visit. */
  }
  const shell = document.querySelector<HTMLElement>(".mgmt-shell");
  if (shell) shell.dataset.density = value;
  window.dispatchEvent(new Event("miro:mgmt-density"));
}

export function WorkspaceTools({
  locale,
  role,
}: {
  locale: Locale;
  role: AppRole;
}) {
  const he = locale === "he";
  const [searchOpen, setSearchOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [query, setQuery] = useState("");
  const density = useSyncExternalStore(
    subscribe,
    readDensity,
    () => "comfortable",
  );
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".mgmt-shell");
    if (shell) shell.dataset.density = density;
  }, [density]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        // Do not steal an editing shortcut or open over an existing modal.
        const target = event.target as HTMLElement;
        if (
          target.matches("input, textarea, select") ||
          target.isContentEditable ||
          document.querySelector(
            ".mgmt-drawer-root--open, .mgmt-dialog-root--open",
          )
        )
          return;
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  const entries = mgmtNavItems.filter((item) =>
    `${mgmtNavItemLabel(item.key, locale)} ${mgmtNavItemSubtitle(item.key, locale)} ${item.key}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  return (
    <>
      <button
        type="button"
        className="mgmt-workspace-search"
        onClick={() => setSearchOpen(true)}
        aria-label={he ? "חיפוש עמוד בסביבת העבודה" : "Find a workspace page"}
      >
        <Search size={17} aria-hidden="true" />
        <span>{he ? "מעבר לעמוד…" : "Go to a page…"}</span>
        <kbd>⌘ K</kbd>
      </button>
      <IconAction
        label={he ? "תצוגת סביבת העבודה" : "Workspace display"}
        onClick={() => setPreferencesOpen(true)}
      >
        <SlidersHorizontal size={18} aria-hidden="true" />
      </IconAction>
      <Dialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title={he ? "לאן מתקדמים?" : "Where would you like to go?"}
        closeLabel={he ? "סגירה" : "Close"}
        size="md"
      >
        <div className="mgmt-workspace-finder">
          <SearchField
            label={he ? "חיפוש עמוד" : "Search pages"}
            placeholder={
              he
                ? "חפש מוצרים, פניות, כספים…"
                : "Search products, requests, finance…"
            }
            value={query}
            onValueChange={setQuery}
          />
          <div className="mgmt-workspace-finder__results">
            {entries.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  href={`/${locale}${item.href}`}
                  className="mgmt-workspace-finder__link"
                  onClick={() => setSearchOpen(false)}
                >
                  <span className="mgmt-workspace-finder__icon">
                    <Icon size={19} aria-hidden="true" />
                  </span>
                  <span className="mgmt-workspace-finder__text">
                    <strong>
                      <OverflowText
                        text={mgmtNavItemLabel(item.key, locale)}
                        focusable={false}
                      />
                    </strong>
                    <span>
                      <OverflowText
                        text={mgmtNavSectionLabel(item.section, locale)}
                        focusable={false}
                      />
                    </span>
                  </span>
                  {item.ceoOnly && role !== "ceo" ? (
                    <Lock
                      size={15}
                      aria-label={he ? "עריכה למנכ״ל בלבד" : "CEO editing only"}
                    />
                  ) : (
                    <ArrowUpRight size={15} aria-hidden="true" />
                  )}
                </Link>
              );
            })}
            {entries.length === 0 ? (
              <p className="mgmt-workspace-note">
                {he ? "לא נמצאו עמודים תואמים." : "No matching pages."}
              </p>
            ) : null}
          </div>
        </div>
      </Dialog>
      <Drawer
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        title={he ? "סביבת עבודה שמתאימה לך" : "Make the workspace yours"}
        side="end"
        closeLabel={he ? "סגירה" : "Close"}
      >
        <fieldset className="mgmt-workspace-preferences">
          <legend>{he ? "צפיפות התצוגה" : "Display density"}</legend>
          {(
            [
              [
                "comfortable",
                he ? "מרווחת" : "Comfortable",
                he
                  ? "מרווחים נדיבים בין שורות ונתונים."
                  : "More breathing room between rows and figures.",
              ],
              [
                "compact",
                he ? "קומפקטית" : "Compact",
                he
                  ? "יותר נתונים על המסך, עם כפתורים בגודל נגיש."
                  : "More data on screen, with accessible control sizes.",
              ],
            ] as const
          ).map(([value, label, description]) => (
            <label key={value} className="mgmt-workspace-preferences__choice">
              <input
                type="radio"
                name="workspace-density"
                value={value}
                checked={density === value}
                onChange={() => chooseDensity(value)}
              />
              <span>
                <strong>{label}</strong>
                <span>{description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="mgmt-workspace-note">
          {he
            ? "שנה ערכת צבעים בסרגל העליון. לחצן ההשהיה עוצר טקסט נע בכל סביבת העבודה."
            : "Choose a theme in the top bar. Its pause control stops moving text across the workspace."}
        </p>
      </Drawer>
    </>
  );
}
