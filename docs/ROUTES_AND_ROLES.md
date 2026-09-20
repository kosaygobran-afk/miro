# Routes and Roles Matrix

Route groups in parentheses are organization only. They do not appear in URLs.

## Public Routes

- `/he` and `/en` - homepage
- `/he/services` and `/en/services` - services index
- `/he/services/home` and `/en/services/home` - home services
- `/he/services/business` and `/en/services/business` - business services
- `/he/services/[slug]` and `/en/services/[slug]` - service detail
- `/he/about` and `/en/about` - about page
- `/he/contact` and `/en/contact` - contact/request quote preview
- `/he/privacy` and `/en/privacy` - draft privacy page, noindex
- `/he/terms` and `/en/terms` - draft terms page, noindex
- `/he/accessibility` and `/en/accessibility` - draft accessibility statement, noindex
- `/he/login` and `/en/login` - shared login, unavailable until Phase 2
- `/he/signup` and `/en/signup` - customer-only signup, unavailable until Phase 2
- `/he/forgot-password` and `/en/forgot-password` - recovery request, unavailable until Phase 2
- `/he/reset-password` and `/en/reset-password` - reset page, unavailable until Phase 2

## Development-Only Routes

- `/design-system` - noindex and blocked in production
- `/catalog-preview` - noindex and blocked in production

## Protected Routes

These routes exist but fail closed until real authentication and role checks are implemented.

- `/he/account` and `/en/account` - customer account
- `/he/worker` and `/en/worker` - worker area
- `/he/admin` and `/en/admin` - CEO/admin area

## Role Permissions Planned For Phase 2

| Audience | Entry | Permissions |
| --- | --- | --- |
| Visitor | No account needed | Browse public pages and submit enquiry only after real enquiry backend exists |
| Customer | Public signup and shared login | Own profile and own service requests |
| Worker | Shared login; owner assigns role manually | Assigned jobs and minimum required customer information |
| CEO | Shared login; owner provisions account | Operational administration, assignments, catalog management and approved reporting |

There is no role selector, no worker signup form and no CEO signup form.
