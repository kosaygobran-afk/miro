# Decisions Log

## 2026-09-20: Project Initialization

- Selected Next.js 16.3.5 with App Router, TypeScript, Tailwind CSS
- Used npm as the actual package manager because the repository has `package-lock.json`
- Selected next-intl for internationalization (Hebrew/English)
- Kept `next-themes` installed from the original dependency list, but Phase 1 uses a small pre-paint script and `miro-theme` localStorage key to avoid hydration errors in the verified Next.js 16/React 19 setup
- Selected Supabase for backend with separate browser/server clients
- Decided to create modular Next.js application with clear feature boundaries
