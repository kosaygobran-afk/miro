"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { FormSection, PageHeader } from "@/components/management/ui";
import { salesCopy as copy } from "./sales-copy";
import { SalesHistoryView } from "./sales-history-view";
import { ReportChoices } from "./ui/reporting-workspace";
import { useManagementTools } from "./tools/management-tool-provider";

export function SalesPanel({
  locale,
  initialView = "history",
}: {
  locale: "he" | "en";
  initialView?: "history" | "record";
}) {
  const [view, setView] = useState<"history" | "record">(initialView);
  const [historyReloadKey, setHistoryReloadKey] = useState(0);
  const { openTool, getToolState } = useManagementTools();
  const posOpen = getToolState("pos")?.open === true;
  const wasOpen = useRef(posOpen);
  const he = locale === "he";
  const t = (map: Record<"he" | "en", string>) => map[locale];

  useEffect(() => {
    if (wasOpen.current && !posOpen) setHistoryReloadKey((key) => key + 1);
    wasOpen.current = posOpen;
  }, [posOpen]);

  return (
    <section className="mgmt-page-stack" dir={he ? "rtl" : "ltr"}>
      <PageHeader title={t(copy.pageTitle)} subtitle={t(copy.pageSubtitle)} />
      <ReportChoices
        label={he ? "תצוגת מכירות" : "Sales workspace view"}
        value={view}
        onChange={(next) => {
          setView(next);
          if (next === "record") openTool("pos");
        }}
        options={[
          {
            value: "history",
            label: he ? "היסטוריית מכירות" : "Sales history",
          },
          { value: "record", label: he ? "רישום מכירה" : "Record a sale" },
        ]}
      />
      <div className="mgmt-sale-view" hidden={view !== "record"}>
        <FormSection
          icon={<Plus size={19} aria-hidden="true" />}
          title={t(copy.recordSectionTitle)}
          description={
            he
              ? "הקופה מרכזת את הקטלוג, הלקוח, המלאי והתשלומים. ניתן לשחזר טיוטה קיימת ולהמשיך מכירה ממתינה."
              : "The POS brings together catalog, customer, stock and payments. Resume an existing draft or recover a pending sale."
          }
        >
          <button
            type="button"
            className="mgmt-button mgmt-button--primary"
            onClick={() => openTool("pos")}
          >
            <Plus size={17} aria-hidden="true" />
            {he ? "פתיחת קופה" : "Open POS"}
          </button>
        </FormSection>
      </div>
      <div className="mgmt-sale-view" hidden={view !== "history"}>
        <SalesHistoryView locale={locale} reloadKey={historyReloadKey} />
      </div>
    </section>
  );
}
