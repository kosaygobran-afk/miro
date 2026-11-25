# MIRO Website

MIRO is a Hebrew-first security and communications storefront built with Next.js and Supabase. It supports bilingual browsing, guest and account shopping, and checkout requests that staff review in the management console.

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

Start with the [MIRO project plan](docs/PROJECT_PLAN.md) for shipped features, pending work and the pilot checklist. See the [project status log](docs/PROJECT_STATUS.md) for dated verification and deployment details.
