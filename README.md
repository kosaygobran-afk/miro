# MIRO Website

MIRO is a Next.js foundation for a Hebrew-first security and communications website. The public storefront is complete as a Phase 1 visual/structural foundation. Supabase authentication and database workflows are being introduced incrementally through the Phase 2 migration foundation.

## Requirements

- Node.js LTS compatible with Next.js 16
- npm, using the committed `package-lock.json`

## First Run

```bash
npm install
npm run dev
```

Open:

- Hebrew: `http://localhost:3000/he`
- English: `http://localhost:3000/en`
- Development design preview: `http://localhost:3000/design-system`
- Development catalog preview: `http://localhost:3000/catalog-preview`

## Useful Commands

```bash
npm run typecheck
npm run lint
npm run build
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env.local` when needed.

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Public pages work without Supabase credentials through the local fallback catalog. Authentication and live catalog reads require a configured Supabase project; service-role access is server-only.

## Current Status

Read `docs/PROJECT_STATUS.md` before continuing work. Phase 2 authentication, role authorization and account/service-request workflows are implemented. See the latest status entry for deployment verification and remaining owner actions.
