import { StoreLiveRefresh } from "@/features/catalog/store-live-refresh";

interface ProductsLayoutProps {
  children: React.ReactNode;
}

export default function ProductsLayout({ children }: ProductsLayoutProps) {
  return (
    <>
      <StoreLiveRefresh />
      {children}
    </>
  );
}
