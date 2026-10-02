# Implementation prompt for the next lead agent

Copy the brief below into the coding agent. Keep [PROJECT_AUDIT_2026-09-28.md](PROJECT_AUDIT_2026-09-28.md) available alongside it; finding IDs refer to that report.

---

You are the lead engineer for MIRO, working in `/Users/kusay_gurban/Documents/miro`. Use subagents with bounded tasks and explicit file ownership. Your job is to repair and verify the existing platform, not redesign it from scratch. The audit baseline was `160b310` / version `0.0.3`; inspect the actual checkout and preserve subsequent/unrelated changes.

The project is a Hebrew-first security/communications website and enquiry storefront, with customer accounts, assigned worker requests and a shared admin/CEO operations console. Public checkout is intentionally absent. Next.js 16.3.5, React 19, next-intl and Supabase are already installed. Preserve both locales, RTL/LTR, three themes, premium black/yellow styling, mobile support and reduced motion.

Read `AGENTS.md`, the audit, current status, architecture, route matrix and operations docs. Read relevant installed guides under `node_modules/next/dist/docs/` before changing Next.js code. Historical docs are contradictory: determine actual behavior from code, migrations and tests, then reconcile documentation. No secret values in output, fixtures or commits.

Implement the confirmed P0/P1 defects and their necessary P2 contract/test/UX support. Do not add public checkout, an invoice provider, marketing messaging, a new CMS or a replacement framework. Distinguish a repair from a new business capability. Prepare staging/deployment instructions and reviewable migrations; this brief alone does not authorize production migration rollout, changing real business records, sending email/SMS, or public deployment. Use isolated local/staging fixtures for writes.

## Lead responsibilities and delegation plan

Use no more than three concurrent workers plus yourself if four slots are available. Assign one owner per file family. No two agents edit the migration sequence, shared contracts or the same UI component simultaneously. Define and review DTOs before parallel integrations. Workers report changed files, evidence, tests, limitations and any dependency on another worker. Do not accept a worker's PASS without inspecting the relevant diff/test output.

Suggested waves:

1. Lead records baseline, reproduces F01/F02/F03 and publishes shared contracts. Database worker owns new migrations/SQL tests; API worker owns management/intake routes; UI worker owns settings/product editor and accessibility. Database changes land before dependent integrations are validated.
2. Database worker implements aggregates, idempotency and concurrency fixes; API worker wires reporting/inventory/enquiries; UI worker wires operator workflows and storefront price/stock contracts.
3. Reassign a worker to independent security/RLS review, one to browser workflow/accessibility coverage and one to operational/docs cleanup. Lead integrates, resolves interface conflicts and runs final gates sequentially where they share `.next` or DB state.

A reasonable module layout is `src/features/catalog/contracts.ts`, `src/features/management/contracts.ts`, `src/features/requests/contracts.ts`, and server-only data/use-case modules beside them. Adapt to established structure; avoid a broad file-movement exercise. Generate/use `Database` types in all Supabase clients. Keep browser-safe contracts separate from server-only modules.

## Task A: contain confidential data and public ingestion exposure — F01, F06, F07

Owned DB files: new forward migration after `20260927110000`, plus `supabase/tests/` coverage. Do not edit already-applied migrations to repair a live schema.

1. Inventory grants/policies on products, variants, images, prices, orders/items, suppliers, stock, audit and analytics. RLS does not hide columns. Revoke broad SELECT before adding narrow grants. Ensure default privileges will not automatically re-expose newly added private columns.
2. Publish an explicit public catalog DTO containing only approved display fields: public product/category identifiers/slugs/names/descriptions, approved price data, images/alt text, variant display identifiers/options and the chosen public stock representation. Exclude purchase cost, cost override, supplier internals and order-item unit costs. Decide whether exact stock quantities should be public; do not expose them accidentally.
3. Update `src/lib/store-data.ts`, account saved-product reads and public detail/metadata queries to use the safe projection. Preserve authorized staff procurement reads through role-checked RPCs or server-only service reads. A public view must enforce publication and role boundaries; do not create an unrestricted security-definer view over private rows.
4. Restrict direct public table INSERT for enquiries/analytics. Implement a server/edge intake command with a shared rate-limit store and bounded payloads. Route origin checks are useful CSRF defense, not a replacement for rate control. Document trusted proxy IP extraction; reject oversized requests before expensive parsing where practical. Return Retry-After for limits.
5. Preserve active-account checks for signed-in intake. Stamp `customer_id` / analytics `user_id` from verified auth; never accept arbitrary account attribution. Anonymous submissions retain null account identity. Public inserts must not set triage/assignment fields.
6. Beacon and fetch must use the same validated body field for a bounded session identifier. The existing browser emits `session_id`, while the server only reads a header/cookie. Choose one canonical schema, test both transports and avoid storing raw PII in analytics. Give the identifier an explicit expiry/rotation policy. Financial events come from trusted orders, not browser telemetry.

Acceptance:

- Anonymous direct SELECT of private cost/supplier columns fails, including a wildcard/embed attempt; allowed catalog reads still succeed.
- Customer A cannot read B's order or cost snapshots; worker cannot read procurement fields; admin/CEO approved reads succeed; inactive accounts retain no privileged access.
- Direct anonymous DB writes cannot bypass the chosen intake gate. Forged analytics `user_id` and enquiry `customer_id` fail or are safely overwritten from auth.
- Beacon stores the intended bounded session ID; duplicate/invalid events are handled deliberately; telemetry failures do not break browsing but are observable server-side.
- Existing public enquiry valid/invalid/honeypot tests remain meaningful; no fake success for real persistence failure.

## Task B: make product editing transactional and truthful — F02, F11, F14

Primary files: `api/management/products/route.ts`, `variants/route.ts`, `categories/route.ts`, `product-images/route.ts`, `product-prices/route.ts`, `product-management.tsx`, and `components/management/products/*`.

1. Reproduce: editor sends `{id, ...formData}` including status; route branches on every status and ignores the remaining fields. Write a failing integration test before changing this behavior.
2. Define separate explicit commands such as `updateFields`, `publish`, `unpublish`, or an atomic `saveProduct` with both fields and requested state. Do not save half the command or silently drop fields. If keeping PATCH field-only, remove `status` from the normal form payload and reject mixed unsupported input.
3. Create as draft. Show Publish after valid persisted product/variant data exists. Publishing should return safe structured issue codes (`missing_category`, `missing_name_he`, `missing_sellable_variant`, etc.) that the UI localizes; never interpolate absent `details` or leak raw SQL errors.
4. Use a transactional database command for related catalog mutation + audit. Include variant default changes in the same transaction. Validate current actor inside the command, use a fixed search_path, restrict EXECUTE, and maintain publication invariants under concurrency.
5. Add optimistic concurrency/version checks for editor updates if multiple staff can edit the same item; report conflict rather than silently overwriting newer work. At minimum define how stale editors are handled.
6. Align null/empty/positive values between zod and database checks. `price_override=0` and `reorder_qty=0` currently pass some API schemas but fail DB constraints. Bound descriptions/JSON metadata and validate slug/URL formats. Restrict media protocols and approved host/storage usage consistently with Next Image.
7. Make audit failure fail the transaction. Record actor/entity and bounded changes without secrets. Missing entities must return 404, and a retry must not falsely imply a second successful deletion.
8. Revalidate relevant localized list/category/detail surfaces according to the actual rendering/cache model. Verify edited data after reload; do not assume `revalidatePath` makes an already mounted client fresh.

Acceptance scenarios: edit every field on an existing draft; edit an active product; save unchanged status with changed price/name; atomic edit-and-publish if supported; invalid publication rolls back; create default variant failure rolls back; audit failure rolls back; archive maintains history; concurrent editors get defined conflict behavior. Test UI → API → DB → storefront, not only direct RPCs.

## Task C: tax, settings and pricing contracts — F03, F04, F12

Primary files: tax/settings routes and `settings-panel.tsx`, `contact-config.ts`, `store-data.ts`, product card/detail components, new migrations.

1. Define one effective-tax resolver for a business date. Scheduling next month's rate must preserve today's rate; periods may not overlap ambiguously. Serialize edits. Reject invalid/backwards periods. If no applicable rate exists, return a configuration error unless a deliberate zero-rate record exists. Do not silently use zero.
2. Return a tax DTO with `isCurrent` / effective status, rather than inventing `is_current` in the UI. Use the same resolver in sale writes, settings and reporting. Sale snapshots remain immutable after future rate changes.
3. Create discriminated settings schemas by key. Inventory policy vocabulary must be shared. Define and implement `inherit`, variant threshold defaults and per-product overrides. Migrate incompatible stored policy values explicitly after inspecting existing data; never guess a destructive mapping.
4. Until multi-currency and exclusive-tax pricing are implemented, make ILS/VAT-inclusive behavior explicit and make unsupported controls read-only/unavailable. Do not implement currency conversion merely to satisfy a dropdown. If expanding support, get a business decision and propagate it through products, sale snapshots, reporting and formatting.
5. Add CEO-only validated `public_contact` editing for phone, WhatsApp, email, address and hours in both languages. Public reads expose only the approved whitelist. Read address/hours even when env phone/email overrides exist; display which values are environment-managed so editing isn't deceptive.
6. Define one pure price resolver with explicit precedence across base price, sale price if supported, role price and selected variant. Lead obtains/records a business choice for ambiguous precedence. Preserve raw base price separately from a default variant's resolved price. UI cards/dialog/detail must use the same result and display precision. Public metadata/JSON-LD must use public offers, never private role pricing.
7. Compute availability for the selected variant and label aggregate product availability separately. Do not leave an unchanged server stock badge under a changing variant selector. Define unpriced and zero-price behavior consistently.

Acceptance: current/future/past tax fixtures; schedule today+30 and sell today without rate loss; correct UI current-rate label; saved setting changes actual behavior; invalid keys/value shapes rejected; admin cannot mutate CEO settings; contact config honors per-field overrides; price matrix for visitor/customer/worker/admin/CEO and variants with/without override; cents survive display.

## Task D: inventory and sales consistency — F09, F10

Primary files: new sale/stock migrations, sales/inventory routes and managers, sales history.

1. Clarify quantity stock tracking separately from serial/lot identification. Current `none` skips all stock movement despite docs saying simple quantity. Prefer explicit stock-tracked policy, with `none` meaning no serial/lot detail. Preserve truly untracked services if needed through an explicit separate setting. Document migration/backfill impact; do not invent historic stock movements for unknown sales.
2. Every stock path must acquire locks in the same order. Current sale takes row then advisory through nested movement; adjustments take advisory then row. Acquire variant advisory locks in deterministic sorted order before row locks across all sale/adjust/return paths. Use actual concurrent connections to reproduce the old deadlock and demonstrate the fix.
3. Add idempotent sale commands: client-generated request UUID, actor scope, canonical payload hash, unique DB constraint and transactional response storage. Same key/same payload returns original order ID. Same key/changed payload returns 409. Repeated request cannot write a second order, movement or audit.
4. Preserve decimal DB arithmetic, per-unit discount contract, nonnegative totals, immutable cost/VAT/name/SKU snapshots and separation of customer ID from `recorded_by`. Bound item counts/quantities and validate stock atomically. Customer association must follow an explicit policy for staff accounts instead of relying on misleading variable names.
5. Implement a narrowly scoped staff return/correction command linked to original sale items. Bound cumulative returned quantity, preserve original snapshots, create compensating financial/stock records and audited reason/actor. Report gross, returns and net correctly. No payment-provider refund is implied.
6. Serial/lot functionality must be either implemented end-to-end or clearly unavailable. A selectable mode plus unused table is not complete. If implementing: receive identifiable units/lots, allocate exactly the sold quantity atomically, prohibit selling the same serial twice, link returned units and maintain traceability. Obtain an owner decision before broad expansion.

Acceptance: concurrent sale vs adjustment; two sales for last unit; reverse-order multivariant carts; duplicate request after simulated lost response; full transaction rollback on insufficient stock; quantity-tracked non-serial sale decrements stock; repeated/partial returns cannot exceed sold quantity; historical finance remains explainable.

## Task E: accurate reports and scalable lists — F05, F14

Primary files: overview page; management finance/analytics/inventory/users/customers/sales/audit routes; corresponding components.

1. Review and use the existing `management_sales_summary`, `management_analytics_overview`, `management_inventory_list` RPCs through the user-context client. They enforce `active_app_role`; calling them through service role loses `auth.uid`. Extend/create projections where their output doesn't cover the UI; do not pretend wiring a name completes the contract.
2. Compute sums/counts/distinct sessions in SQL before pagination. Inventory filtering and totals must be server-side; test product name, SKU and barcode search. Parameterize search instead of injecting raw OR grammar. Validate dates, page size, offsets, UUIDs and filter enums.
3. Define a shared business timezone, preferably the configured Israel business timezone, and half-open date intervals. Current/previous periods, daylight-saving boundaries, cancelled/refunded/corrected sales and dashboard/finance totals must agree. Test actual PostgREST filter syntax.
4. Treat missing data/errors as unavailable, not zero revenue, zero customers or an empty catalog. Return panel-specific availability/errors so unaffected panels remain usable. Use safe error codes and request IDs; redact secrets/PII in logs.
5. Replace separate first-page profiles/roles/auth-user joins with a paginated authorized directory contract. Do not enumerate all auth users per request. Preserve CEO-only user mutation and admin read-only access. Paginate customer history and requests, and scope returned personal data.
6. Provide deterministic sorting and true total counts. Preserve filters in URL state where useful. Render pagination/reset/loading/error/empty states accessibly.

Acceptance: >1,500 products/users/orders/items and >10,000 analytics events in isolated fixtures; totals match direct SQL sums exactly; filtered rows beyond the first page are discoverable; missing auth joins cannot silently change a role; transient DB failure doesn't appear as a valid zero; admin/CEO reports reconcile with orders and returns.

## Task F: actionable enquiry and worker workflow — F08

Primary files: enquiries/account APIs, request dashboard/list, customer detail/account views; new request contracts and migrations only as necessary.

1. Add paginated queue filters, request detail, submitted date, contact channels, source, product/variant context and assignment. Include minimum necessary contact details for assigned workers, with server/DB checks. No unauthorized cross-customer or cross-worker visibility.
2. Use a shared status enum including `waiting_customer`, and an explicit transition matrix. Decide whether workers may reopen closed requests; enforce it in SQL and UI. Consolidate the two assignment columns with a reviewed data migration or define one canonical field and deprecate the other.
3. Link verified signed-in submissions to their own account. Do not auto-link anonymous enquiries by email. Support guest leads in the queue without pretending they have accounts. Validate active/public product and variant-parent association at intake.
4. Distinguish saved, assigned and delivered. If notifications are approved, use an outbox/retry pattern and test with a mail sink. Never send actual messages during automated testing. If notifications remain absent, say so in the UI/runbook.

Acceptance: public product enquiry preserves selected variant; admin sees contact/context and can assign; assigned worker sees and updates only permitted requests; customer account shows its linked enquiry; waiting-customer survives API/reload; 101st request is accessible; invalid variant/product pair fails safely.

## Task G: management design and accessibility — F13

Primary files: `components/management/shell/*`, `overview-panel.tsx`, `settings-panel.tsx`, legacy custom editor/drawer components, `styles/management.css`, `styles/workspace.css`.

1. Associate every input/select with localized label/description and validation error. Fix the overview list semantics. Give the mobile storefront icon link an accessible name when its visible text is hidden.
2. Reuse shared Dialog/Drawer for custom overlays where suitable. Verify initial focus, trapped tab order, Escape, focus restoration, scroll locking and nested-overlay behavior. Do not rely on `aria-modal` alone.
3. Investigate mobile settings clipping. Checking only `documentElement.scrollWidth` is insufficient when an ancestor hides overflow; inspect bounding boxes of actual inputs/buttons/table cells against their visible containers. Make large tables scroll within a labeled keyboard-accessible region or use cards. Never hide essential controls to pass overflow checks.
4. Run axe after fonts and theme transitions settle; keep reduced-motion verification separate. Fix confirmed token contrast, especially yellow text on brighter modes and role badges. Avoid counting animation frames as stable contrast failures.
5. Replace vague success states with evidence of persisted changes; make confirmations localized and reversible where possible. Show admin read-only restrictions clearly without mislabeling viewable pages as entirely forbidden.

Acceptance matrix: CEO and admin; both locales; all three themes; 320/390/768/1440 widths; sidebar expanded/collapsed/mobile; product editor tabs, variant/image dialogs, tax form, user confirmations, sales and requests; keyboard-only, 200% zoom and reduced motion. No clipped essential control, missing accessible name, stable axe A/AA violation or inaccessible modal. Manual screen-reader review is still a separate launch action.

## Task H: test coverage, operational handoff and honest scope — F15, F16

1. Add isolated authenticated API/browser fixtures for customer A/B, assigned/unassigned worker, admin, CEO, suspended/blocked users. Test mutations and denials directly, not only page entry. Prefer a local Supabase stack or controlled staging for PostgREST/auth integration; plain PostgreSQL role emulation alone doesn't cover those boundaries.
2. Update `scripts/verify-design.mjs:381`: assert stable product identity in the quote URL, then follow the link and verify the resolved localized context. Preserve both live and explicit development-demo behavior. Do not delete the failing assertion or ignore console/chunk errors to get green output.
3. Extend admin verification to CEO-specific controls, deterministic fixtures, network/API assertions, stable screenshots and axe. Always clean disposable fixtures in finally. Missing required infrastructure must report SKIP/BLOCKED, not PASS. Do not rely on live business rows for test expectations.
4. Add CI gates suitable for the repository host: install locked dependencies, lint/typecheck/format, migration/SQL tests, production build, browser flows and isolated recovery tests. Avoid parallel build/typecheck jobs sharing generated `.next` files. Recovery builds use fake Supabase credentials; rebuild with the intended environment afterward.
5. Use the live published catalog for sitemap detail/category URLs; preserve canonical legacy redirects and avoid private role data in metadata. Add distinct unavailable/empty product states. Media upload/CMS is optional; document the supported approved-URL workflow accurately if retained.
6. Reconcile `PROJECT_STATUS.md`, `ROUTES_AND_ROLES.md`, `OPERATIONS.md`, `ARCHITECTURE.md`, `DESIGN_SYSTEM.md` and README. Put current state first; historical entries remain dated. Record actual service-key dependencies, migrations applied versus merely authored, and the real worker/admin/CEO behavior.
7. Document structured monitoring, retention/deletion boundaries, backup/restore rehearsal, account recovery/offboarding and migration/application compatibility. Do not assert a hosting backup feature is enabled without evidence. Add environment validation and useful private-service failure states.

Final commands, adjusted only for available isolated ports:

```sh
npm run lint
npm run typecheck
npm run format:check
python3 scripts/verify-database.py
PORT=3117 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3117 npm run test:e2e
npx playwright test --config=playwright.recovery.config.ts
npm run build
# Start this freshly rebuilt app on a free port, then:
ADMIN_BASE_URL=http://127.0.0.1:3117 node scripts/verify-admin-console.mjs
DESIGN_BASE_URL=http://127.0.0.1:3117 node scripts/verify-design.mjs
```

Also run newly added workflow/concurrency tests. Stop only test servers created by this task; do not use broad process-kill commands. Never reset or migrate the linked production project to obtain passing tests.

## Definition of done and final response

Maintain a checklist for F01–F16 with fixed / verified / explicitly deferred / blocked and evidence. For a deferred business capability, name the missing decision and expose an honest unavailable UI. A passing build is not evidence that settings, sales or enquiries work.

Update `docs/PROJECT_STATUS.md` after each meaningful change with what/why/checks/blockers. At milestones report newly relevant privacy/accessibility/business approval work with an owner/action. No claim of legal compliance from engineering tests.

Deliver a reviewable diff and migration sequence, current architecture/data-flow notes, screenshots for representative authenticated flows, test results including skips/failures, and a concise list of outstanding launch actions. Explain each fixed business trigger and result. Do not publish, merge or apply live schema changes just because local gates pass.

---
