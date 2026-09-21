# Learning Log

## Concepts Learned from Actual Changes

### 2026-09-20: Next.js App Router Route Groups

- Learned that route groups in parentheses (e.g., (public), (auth)) are for organization only and do not affect the URL path.
- This allows us to separate public and protected routes while keeping the same URL structure.

### 2026-09-20: Next.js Metadata and Route Groups

- Learned that we can define metadata per route group or individual routes.
- For localized routes, we need to set metadata in the layout.tsx for each locale.

### 2026-09-20: next-intl Locale Routing

- Learned that next-intl provides a straightforward way to set up localized routing with Next.js App Router.
- We need to wrap the app with the NextIntlClientProvider and use the usePathname and useRouter hooks for navigation.

### 2026-09-20: Theme Persistence

- The active Phase 1 theme control stores `light` or `dark` under the `miro-theme` localStorage key.
- A small script in `src/app/[locale]/layout.tsx` applies the saved or system theme before paint.
- The header toggle updates `document.documentElement.dataset.theme`, so reload persistence works without hydration errors.

### 2026-09-20: Route Groups Are Not URL Segments

- Files under `src/app/[locale]/(auth)/login/page.tsx` become `/he/login` and `/en/login`, not `/he/auth/login`.
- Parentheses help organize files without changing the public URL.

### 2026-09-20: Authentication vs Authorization

- Login forms are only authentication: proving who the user is.
- Private route access is authorization: deciding what that user may see.
- Because Phase 1 has no real authentication, private pages must fail closed and show no protected data.

### 2026-09-20: Hydration Errors

- A theme icon rendered differently on server and browser caused hydration errors.
- The fix was to apply the theme before paint and render stable icon markup, then use CSS to show the correct icon.
