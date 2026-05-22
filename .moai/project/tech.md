# tech.md — kikoweb

> Created: 2026-05-22 | Status: Active Development
> Purpose: Technology stack reference for developers, agents, and the hardening/refactor pass
> Verified against: package.json, lib/db.ts, lib/repositories/, lib/types.ts, next.config.ts (2026-05-22 refactor)

---

## Stack Overview

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Framework | Next.js | 16.2.6 | App Router, Turbopack dev bundler |
| UI Library | React | 19.2.4 | Server + Client components |
| Language | TypeScript | 5.x | Strict mode |
| Styling | Tailwind CSS | v4 | `@tailwindcss/postcss` adapter; no `tailwind.config.js` |
| Component primitives | shadcn/ui (adopting) | — | Radix UI: dialog, dropdown-menu, tabs, slot; class-variance-authority, clsx, tailwind-merge |
| Icons | lucide-react | ^1.14.0 | |
| State management | Zustand | 5.0.13 | `lib/store.ts` — UI-only state |
| Graph visualization | react-force-graph-2d | 1.29.1 | Canvas-based; custom d3-force simulation |
| DB driver | pg | ^8.20.0 | PostgreSQL wire protocol; `pg.Pool` singleton in `lib/db.ts` |
| Auth | next-auth | 5.0.0-beta.31 | Installed but NOT configured (placeholder) |
| Instagram ingestion | apify-client | 2.23.2 | Active scraping path |

---

## Framework Choices

### Next.js 16 App Router

The App Router collocates API routes inside `app/api/`, enabling a single deployable artifact for both the UI and the data layer. Turbopack (`next dev`) provides fast local HMR without a separate Vite config.

Note: Next.js 16 is a recent release with breaking changes from prior major versions. Before modifying any Next.js-specific code (routing, server actions, middleware), read `node_modules/next/dist/docs/` — training data may not reflect the current API surface.

### Tailwind CSS v4

v4 uses a PostCSS plugin (`@tailwindcss/postcss`) instead of a JS config file. CSS variables and theme tokens are defined in `app/globals.css`. The native `lightningcss` binary is required — see Dev Environment below.

### Zustand 5

Zustand 5 drops the deprecated `StateCreator` pattern. `lib/store.ts` holds only UI state: `selectedClusterId`, `focusedBrandId`, `getCatOpen`, `locale`. Server state is not cached client-side (fetched on demand via `fetch`).

### pg Pool + Repository Pattern

The data layer uses raw SQL via a `pg.Pool` singleton in `lib/db.ts` (no ORM). This mirrors the `app` and `ai` repos in the kikoai monorepo.

`lib/db.ts` behaviour:
- `server-only` import guard (prevents client-side use)
- Strips `sslmode` and `schema` query params from `DATABASE_URL` to avoid pg v8.16+ driver conflicts
- Sets `ssl: { rejectUnauthorized: false }` to accept dev-app's self-signed certificate
- Sets `options: '-c search_path=wiki'` so unqualified table names resolve to the `wiki` schema
- Global singleton pattern (`globalThis.__pgPool`) prevents pool proliferation under Next.js HMR

Domain query functions are in `lib/repositories/`:

| File | Purpose |
|------|---------|
| `lib/repositories/graph.ts` | Full graph payload — nodes + brands + link rows |
| `lib/repositories/nodes.ts` | `BrandNode` list queries |
| `lib/repositories/brands.ts` | Brand CRUD — list, get with detail, create, update, delete |
| `lib/repositories/comments.ts` | Comment list, create, delete |

Row shapes are plain TypeScript interfaces in `lib/types.ts` (camelCase; SQL aliases map snake_case columns). Composite types (`BrandWithDetail`, `BrandWithNodeKeywords`) match the shapes previously returned by Prisma `include`, so existing consumers (routes, `graph-utils`) required no changes.

---

## Dev Environment

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20 LTS or 22 LTS | Tested on 20.x |
| npm | 10.x+ | |
| lightningcss native binary | auto-installed via postinstall | Required by Tailwind v4; must compile on the local machine. On Apple Silicon + Linux ARM: `npm install` triggers binary compile. If missing, `npm run dev` will error on CSS processing. |

### Startup

```bash
cp .env.local.example .env.local   # set DATABASE_URL and other secrets
npm install                         # installs deps + compiles lightningcss
npm run dev                         # starts on http://localhost:3500
```

Dev server port is **3500** (set in `package.json` scripts: `"next dev -p 3500"`).

### Environment Variables (`.env.local`)

| Key | Purpose |
|-----|---------|
| `DATABASE_URL` | Postgres connection string → dev-app wiki schema (see Database section) |
| `DATABASE_URL_SUPABASE_BACKUP` | Retained backup pointing to decommissioned Supabase instance |
| `APIFY_API_TOKEN` | Apify actor authentication for Instagram scraping |
| `NEXTAUTH_SECRET` | next-auth signing secret (required even in unconfigured state) |
| `NEXTAUTH_URL` | Base URL for next-auth callbacks |

`.env.local` is gitignored. It is never committed.

---

## Database Deployment

### Location and Isolation

kikoweb's runtime database is the **kiko.ai dev-app Postgres cluster** (EC2 `dev-app`, host `54.116.104.193:5432`, db `kikoai`, PG 16 + pgvector extension). All wiki tables live in a dedicated **`wiki` schema**, isolated from:

- `public` schema: kikoai production SKU/embedding tables (~118k SKUs) — DO NOT TOUCH
- `ai` schema: kikoai AI pipeline tables — DO NOT TOUCH

The schema parameter is appended to the `DATABASE_URL` connection string:

```
postgresql://app_user:<password>@54.116.104.193:5432/kikoai?schema=wiki
```

`lib/db.ts` also configures the `pg.Pool` with `ssl: { rejectUnauthorized: false }` to accept the dev server's self-signed certificate (after stripping `sslmode=require` from the URL to avoid driver duplication).

### Schema Management

Schema is managed with **raw SQL migrations** under `database/migrations/`. The baseline file `database/migrations/001_init_wiki_schema.sql` captures the complete wiki schema (format: numbered filename + header comment + `BEGIN; … COMMIT;`). Future schema changes add numbered migration files (`002_...`, `003_...`), matching the convention in the `app` repo.

There is no migration history table yet — migrations are applied manually. A migration runner should be adopted before any production promotion.

### Data State (2026-05-22)

Data was migrated from a now-decommissioned Supabase Postgres instance into the `wiki` schema via `scripts/migrate_to_local.js`. Current row counts:

| Table | Rows |
|-------|------|
| `wiki.brand_nodes` | 15 |
| `wiki.brands` | 1079 |
| `wiki.brand_keywords` | 3495 |
| `wiki.brand_relations` | 0 |
| `wiki.node_relations` | 0 |
| `wiki.brand_comments` | 0 |

---

## Build and Deploy

### Build

```bash
npm run build    # Next.js production build (outputs .next/)
npm run start    # Start production server
```

### Deployment Target

The app is oriented toward **Vercel** (serverless functions, edge network). The raw `pg.Pool` data layer has no native binary dependencies, which is compatible with serverless deployment.

The **database** remains on the dev-app EC2 instance (not a managed cloud DB). Considerations for any production deployment:

- The dev-app Postgres is a shared development cluster; a dedicated production instance is needed before public launch
- `ssl.rejectUnauthorized: false` must be replaced with a valid CA cert in production
- `public/feed-images/` (locally downloaded thumbnails) is ephemeral on serverless deployments; images must move to object storage (S3/R2/CDN) before production

### Linting

```bash
npm run lint     # ESLint 9 (flat config)
```

---

## Known Issues / Tech Debt

### Security (Priority: High)

| Issue | Location | Impact |
|-------|----------|--------|
| All write/delete API routes unauthenticated | `app/api/brands/`, `app/api/comments/` | Any user can create, modify, or delete any brand or comment |
| `refresh-instagram` unauthenticated | `app/api/brands/[id]/refresh-instagram/` | Triggers paid Apify actor runs with no access control; cost-abuse vector |
| SSRF in `/api/proxy-image` | `app/api/proxy-image/` | No domain allowlist; can be abused to probe internal network endpoints |
| No rate limiting | All API routes | Open to brute force and DoS on write endpoints |
| `next-auth` installed but not configured | No `app/api/auth/` route, no middleware, no session usage | Auth is a no-op despite the package being present |
| `ssl.rejectUnauthorized: false` | `lib/db.ts` | Disables TLS certificate verification; acceptable for dev, not for production |

### Maintainability

| Issue | Location | Impact |
|-------|----------|--------|
| No migration runner | `database/migrations/` (manual apply) | Migrations must be applied by hand; no rollback automation |
| No tests | Entire codebase | No regression safety net for refactoring |
| `DATABASE_URL_SUPABASE_BACKUP` retained | `.env.local` | Points to decommissioned Supabase; can be removed |

### Architecture

| Issue | Notes |
|-------|-------|
| `brand_relations` and `node_relations` are empty | The graph's relation link types are defined but not populated; `compute_relations.js` script not yet run on production data |
| `public/feed-images/` is a local disk store | Not compatible with multi-instance or serverless deployment without migration to object storage |
| Cross-schema integration (wiki ↔ kikoai production) | Planned future phase; requires explicit coordination to avoid touching `public`/`ai` schemas |
