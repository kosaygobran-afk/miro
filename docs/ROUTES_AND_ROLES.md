# Routes and Roles Matrix

## Public Routes
- /[locale]/ - Homepage
- /[locale]/services - Services index
- /[locale]/services/home - Home installation/services
- /[locale]/services/business - Business solutions
- /[locale]/services/[slug] - Service detail
- /[locale]/about - About page
- /[locale]/contact - Contact/request-quote
- /[locale]/privacy - Privacy policy
- /[locale]/terms - Terms and conditions
- /[locale]/accessibility - Accessibility statement
- /[locale]/auth/login - Shared login
- /[locale]/auth/signup - Customer signup
- /[locale]/auth/forgot-password - Recovery request
- /[locale]/auth/reset-password - Password reset

## Protected Routes
- /[locale]/(protected)/account - Customer account
- /[locale]/(protected)/worker - Worker dashboard
- /[locale]/(protected)/admin - CEO admin

## Role Permissions
| Audience | Entry | Permissions |
| --- | --- | --- |
| Visitor | No account needed | Browse published pages/products and submit an enquiry |
| Customer | Public signup and shared login | Own profile, own service requests |
| Worker | Shared login; owner assigns role manually | Assigned jobs and minimum customer info |
| CEO | Shared login; owner provisions account | Operational administration, assignments, catalog management, approved reporting |