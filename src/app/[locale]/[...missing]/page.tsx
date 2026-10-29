import { notFound } from "next/navigation";

// Keep unknown localized paths inside the locale layout and its 404 boundary.
export default function MissingPage() {
  notFound();
}
