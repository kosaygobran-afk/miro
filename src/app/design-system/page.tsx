import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, MonitorSmartphone, Palette } from "lucide-react";
import { devPreviewRobots } from "@/lib/seo";

export const metadata: Metadata = {
  title: "MIRO design system development preview",
  robots: devPreviewRobots(),
};

export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <section className="min-h-screen bg-background py-10">
      <div className="miro-container">
        <div className="miro-card mb-8 p-6">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-accent-text">
            Development only
          </p>
          <h1 className="mt-3 text-4xl font-black">
            MIRO design system preview
          </h1>
          <p className="mt-3 text-muted-foreground">
            Noindex development surface for layout, tokens and closed
            private-route previews. It is blocked in production.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {[
            ["Account shell", "/en/account", MonitorSmartphone],
            ["Worker shell", "/en/worker", Lock],
            ["CEO shell", "/en/admin", Palette],
          ].map(([title, href, Icon]) => (
            <div key={title as string} className="miro-card p-5">
              <Icon className="mb-5 size-12 text-primary" aria-hidden="true" />
              <h2 className="text-xl font-black">{title as string}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Preview link points to a real private route, which remains
                closed until Phase 2 authentication exists.
              </p>
              <Link
                href={href as string}
                className="miro-button miro-button-primary mt-5 w-full"
              >
                Open closed route
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
