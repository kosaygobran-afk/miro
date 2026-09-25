# Routes and Roles Matrix

Route groups in parentheses are organization only. They do not appear in URLs.

## Public Routes

- `/he` and `/en` - homepage
- `/he/store` and `/en/store` - public store preview
- `/he/store/[category]` and `/en/store/[category]` - store category preview
- `/he/services` and `/en/services` - services index
- `/he/services/home` and `/en/services/home` - home services
- `/he/services/business` and `/en/services/business` - business services
- `/he/services/[slug]` and `/en/services/[slug]` - service detail
- `/he/about` and `/en/about` - about page
- `/he/contact` and `/en/contact` - contact/request quote preview
- `/he/privacy` and `/en/privacy` - draft privacy page, noindex
- `/he/terms` and `/en/terms` - draft terms page, noindex
- `/he/accessibility` and `/en/accessibility` - draft accessibility statement, noindex
- `/he/login` and `/en/login` - shared login, implemented with Supabase
- `/he/signup` and `/en/signup` - customer-only signup, implemented with Supabase
- `/he/forgot-password` and `/en/forgot-password` - recovery request, implemented with Supabase
- `/he/reset-password` and `/en/reset-password` - reset page, implemented with Supabase

## Development-Only Routes

- `/design-system` - noindex and blocked in production
- `/catalog-preview` - noindex and blocked in production

## Protected Routes

These routes require a verified server session and an active profile. Worker and admin areas enforce role checks.

- `/he/account` and `/en/account` - customer account
- `/he/worker` and `/en/worker` - worker area
- `/he/admin` and `/en/admin` - CEO/admin console (shared shell): Overview
- `/[locale]/admin/products` - catalog + variant editor (publish/unpublish/archive)
- `/[locale]/admin/inventory` - stock ledger, adjustments, receiving, replenishment
- `/[locale]/admin/suppliers` - supplier CRUD
- `/[locale]/admin/sales` - record sale + order history
- `/[locale]/admin/customers` - CRM list and detail (product vs service activity separated)
- `/[locale]/admin/analytics` - first-party product/search analytics
- `/[locale]/admin/finance` - managerial finance (revenue, VAT, COGS, margin, inventory value)
- `/[locale]/admin/users` - user list (CEO controls; admin read-only)
- `/[locale]/admin/requests` - service requests
- `/[locale]/admin/audit` - audit log
- `/[locale]/admin/settings` - tax + business settings (CEO-only writes; CeoSettings)

## Phase 2+ Role Capabilities (see `src/lib/permissions.ts`)

| Audience | Entry                                        | Permissions                                                                       |
| -------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| Visitor  | No account needed                            | Browse public pages and submit enquiry only after real enquiry backend exists     |
| Customer | Public signup and shared login               | Own profile and own service requests                                              |
| Worker   | Shared login; CEO assigns role               | Assigned jobs and minimum required customer information                           |
| Admin    | Shared login; CEO assigns role               | Catalog, inventory, sales recording, analytics, finance and user-list **viewing** |
| CEO      | Shared login; bootstrap or existing CEO adds | Everything, plus user control/deletion, tax and business settings, adding CEOs    |

The initial CEO is `kosay.gobran@gmail.com`, bootstrapped by migration `20260924130000_bootstrap_ceo.sql` after the owner signs up and verifies the email (re-run `npx supabase db push --linked`). Additional CEOs are added only by an active CEO through the audited `add_ceo` flow.

CEO and admin sign in through the shared login and land in the customer interface; the header account menu shows a prominent Management console button (and the admin console has a "Switch to storefront" link and Log out). Workers get a worker-area entry; every signed-in menu has a visible Log out.

There is no role selector, no worker signup form and no CEO signup form.

## Redirects

- Old `/he/products` and `/en/products` URLs permanently redirect to `/he/store` and `/en/store`.
- Old `/he/products/[category]` and `/en/products/[category]` URLs permanently redirect to `/he/store/[category]` and `/en/store/[category]`.

## Sensitive operations

- `/auth/callback` exchanges confirmation/recovery codes and only redirects to localized account/reset routes.
- `/api/account` handles own profile, own requests and authorized staff request updates.
- `/api/management/users` lists accounts for CEO and admin; PATCH (role/status) and DELETE (account removal) are CEO-only and delegate to the audited SQL functions `manage_account` and `delete_user_account`. CEO accounts are protected from these paths; CEO removal happens only through the audited self-delete flow that preserves at least one active CEO.
- `/api/auth/session` returns `{ authenticated, role, name }` for the header account menu; `/api/auth/logout` signs out (JSON 200 for fetch, 303 redirect for form posts).
- `/api/ceo` requires current-password verification for email changes, adding CEOs and deleting only the current CEO account. The last active CEO cannot delete itself.
- `/api/management/{products,variants,suppliers,inventory,sales,categories,product-prices,product-images}` enforce capabilities through `withManagementAuth` (same-origin on mutations + role capability); stock changes flow only through the `record_stock_movement`/`adjust_stock` RPCs; sales through atomic `record_sale` with VAT/cost snapshots; product publishing through validated `publish_product`.
- `/api/management/{tax,settings}` writes are CEO-only (`manageTax`/`manageSettings`, enforced in route AND in `set_tax_rate`/`set_business_setting` RPCs).
- `/api/track` accepts only whitelisted analytics event shapes (same-origin, zod); analytics reads are admin/CEO only.
- Mutation endpoints validate input and same-origin requests. All private pages are noindex.
