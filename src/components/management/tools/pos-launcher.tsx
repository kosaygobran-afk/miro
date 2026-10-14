"use client";

import { useEffect } from "react";
import { useManagementTools } from "./management-tool-provider";
import { PageHeader } from "../ui/page-header";

export function PosLauncher({ locale }: { locale: "he" | "en" }) {
  const { openTool } = useManagementTools();
  const he = locale === "he";
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("resume") === "1")
      openTool("pos");
  }, [openTool]);
  return (
    <section className="mgmt-page-stack" dir={he ? "rtl" : "ltr"}>
      <PageHeader
        title={he ? "קופה" : "Point of sale"}
        subtitle={
          he
            ? "פתיחת סביבת הקופה בחלון העבודה. ניתן להרחיב לתצוגת חלון מלא לפי תמיכת הדפדפן."
            : "Open the point of sale in the workspace. Viewport mode is available where the browser supports it."
        }
        actions={
          <button
            type="button"
            className="mgmt-button mgmt-button--primary"
            onClick={() => openTool("pos")}
          >
            {he ? "פתיחת קופה" : "Open POS"}
          </button>
        }
      />
    </section>
  );
}
