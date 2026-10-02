import { TableSkeleton } from "@/components/management/ui/skeleton";

export default function Loading() {
  return (
    <TableSkeleton
      columns={5}
      columnWidths={["18%", "23%", "10%", "12%", "37%"]}
      minWidth="74rem"
    />
  );
}
