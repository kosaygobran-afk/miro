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

### 2026-09-20: next-themes Theme Persistence
- Learned that next-themes provides a ThemeProvider that persists the theme choice in localStorage and respects system preference.
- The theme can be changed via the setTheme function and will persist across sessions.