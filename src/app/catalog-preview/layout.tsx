import "../globals.css";

export default function CatalogPreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
