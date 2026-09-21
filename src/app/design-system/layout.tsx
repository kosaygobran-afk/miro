import "../globals.css";
import "@/styles/premium.css";
import "@/styles/storefront.css";

export default function DesignSystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
