import { DashboardSkeleton } from "@/components/management/ui/skeleton";

export default function Loading() {
  return (
    <section className="miro-section">
      <div className="miro-container">
        <DashboardSkeleton />
      </div>
    </section>
  );
}
