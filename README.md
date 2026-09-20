# MIRO Website

MIRO is a Next.js foundation for a Hebrew-first security and communications website. Phase 1 is a local visual/structural foundation only: no real authentication, database writes, catalogue, payments or enquiry submission are live yet.

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

Public pages work without Supabase credentials. Auth forms honestly show unavailable behavior and private routes stay closed until Phase 2.

## Current Status

Read `docs/PROJECT_STATUS.md` before continuing work. The next implementation phase is real Supabase authentication, roles and authorization.
