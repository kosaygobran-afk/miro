# Decisions Log

## 2026-09-20: Project Initialization

- Selected Next.js 16.3.5 with App Router, TypeScript, Tailwind CSS
- Used npm as the actual package manager because the repository has `package-lock.json`
- Selected next-intl for internationalization (Hebrew/English)
- Kept `next-themes` installed from the original dependency list, but Phase 1 uses a small pre-paint script and `miro-theme` localStorage key to avoid hydration errors in the verified Next.js 16/React 19 setup
- Selected Supabase for backend with separate browser/server clients
- Decided to create modular Next.js application with clear feature boundaries

## 2026-09-27: Production hardening decisions

- Enquiry-only commerce is confirmed as the launch model: there is intentionally no public checkout/cart; every storefront CTA leads to the enquiry flow (`/api/enquiries` → `service_requests`). POS sales are staff-recorded through the management console (`record_sale`), which now separates the customer account (`orders.user_id`) from the staff recorder (`orders.recorded_by`).
- The mock/demo catalog fallback is gated to non-production (`NODE_ENV !== 'production'`). In production an unhealthy or empty database renders honest empty states rather than sample products/prices.
- Admin (non-CEO) read access to the audit log and finance is intentional (transparency; both are read-only for admins). CEO-only status is reserved for mutations: user management, settings, and tax rates. Nav badges were aligned to this policy.
- Line-level sale discounts are per-unit (`discount_per_unit`, bounded by the unit price), validated identically by the API schema and the DB function, so client and server totals match.
