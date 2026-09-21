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
- `/he/admin` and `/en/admin` - CEO/admin area

## Phase 2 Role Permissions

| Audience | Entry                                     | Permissions                                                                        |
| -------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| Visitor  | No account needed                         | Browse public pages and submit enquiry only after real enquiry backend exists      |
| Customer | Public signup and shared login            | Own profile and own service requests                                               |
| Worker   | Shared login; owner assigns role manually | Assigned jobs and minimum required customer information                            |
| CEO      | Shared login; owner provisions account    | Operational administration, assignments, catalog management and approved reporting |

There is no role selector, no worker signup form and no CEO signup form.

## Redirects

- Old `/he/products` and `/en/products` URLs permanently redirect to `/he/store` and `/en/store`.
- Old `/he/products/[category]` and `/en/products/[category]` URLs permanently redirect to `/he/store/[category]` and `/en/store/[category]`.

## Sensitive operations

- `/auth/callback` exchanges confirmation/recovery codes and only redirects to localized account/reset routes.
- `/api/account` handles own profile, own requests and authorized staff request updates.
- `/api/management/users` lists accounts for staff and delegates role/status changes to audited SQL authorization.
- `/api/ceo` requires current-password verification for email changes, adding CEOs and deleting only the current CEO account. The last active CEO cannot delete itself.
- Mutation endpoints validate input and same-origin requests. All private pages are noindex.
