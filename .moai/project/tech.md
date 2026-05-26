# tech.md — kikoweb

> Created: 2026-05-22 | Status: Active Development
> Purpose: Technology stack reference for developers, agents, and the hardening/refactor pass
> Verified against: package.json, lib/db.ts, lib/repositories/, lib/types.ts, next.config.ts, proxy.ts, lib/write-guard.ts, database/migrations/002_align_to_public_and_merge.sql (feature/mig branch)

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
| Validation | zod | ^4.4.3 | Request-body schemas in `lib/validation.ts`; all mutating routes use `safeParse` |
| Auth | next-auth | 5.0.0-beta.31 | Installed but NOT configured (placeholder) |
| Instagram ingestion | apify-client | 2.23.2 | Active scraping path |
| AWS S3 client | @aws-sdk/client-s3 | ^3.1053.0 | Feed image permanent storage; `lib/s3.ts`; bucket `kikoai-wiki-web` ap-northeast-2 |

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
| `lib/repositories/posts.ts` | `getBrandPosts()` / `replaceBrandPosts()` — `wiki.brand_instagram_posts` |

Row shapes are plain TypeScript interfaces in `lib/types.ts` (camelCase; SQL aliases map snake_case columns). Key rename after the 002 migration: `StyleNode` (was BrandNode/cluster) and `BrandNode` (was Brand). Composite types (`BrandWithDetail`, `BrandWithNodeKeywords`) preserve the wire shape so existing consumers (routes, `graph-utils`) required no changes. bigint ids are cast `::text` in all repository queries so the frontend receives string ids.

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
| `DATABASE_URL_SUPABASE_BACKUP` | Retained backup pointing to decommissioned Supabase instance (can be removed) |
| `DATABASE_CA_CERT` | Optional path to a PEM CA cert; when set, enables full TLS verification (`rejectUnauthorized: true`) instead of the dev fallback |
| `WIKI_WRITE_ENABLED` | Set to `"true"` to enable mutating API routes (write-guard in `lib/write-guard.ts`); unset = view-only mode (403 on all writes) |
| `APIFY_API_TOKEN` | Apify actor authentication for Instagram scraping |
| `S3_BUCKET` | S3 bucket name (default: `kikoai-wiki-web`) |
| `S3_REGION` | S3 region (default: `ap-northeast-2`) |
| `S3_PUBLIC_BASE` | Public URL base for bucket objects (default: `https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com`) |
| `AWS_PROFILE` | AWS shared-credentials profile (default: `kiko.ai`); used by default credential chain |
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

Schema is managed with **raw SQL migrations** under `database/migrations/`. Format: numbered filename + header comment + `BEGIN; … COMMIT;`, matching the convention in the `app` repo.

| Migration | Purpose |
|-----------|---------|
| `001_init_wiki_schema.sql` | Baseline schema (originally from Prisma db push; idempotent, safe to re-run) |
| `002_align_to_public_and_merge.sql` | Realigns naming to mirror `public` schema; drops old tables; imports ~2899 brands + 20 style clusters from `public`; derives ~26,366 keyword rows from `attributes` jsonb |
| `003_propagate_instagram_handles.sql` | Backfills `wiki.brand_nodes.instagram_handle/instagram_url` from `public.brand_nodes.wiki` jsonb (1905 brands; idempotent) |
| `004_brand_instagram_posts.sql` | Creates `wiki.brand_instagram_posts` — one row per post, `image_urls text[]` = S3 URLs ordered (cover = `[1]`), UNIQUE `(brand_id, shortcode)` |

There is no migration history table yet — migrations are applied manually via `scripts/apply_migration.js` or directly. A migration runner should be adopted before any production promotion.

### Data State (post-002 migration)

Data sourced from `public.brand_nodes` + `public.style_nodes` (cross-schema INSERT … SELECT). Old Supabase-seeded data was discarded. Current row counts:

| Table | Rows | Notes |
|-------|------|-------|
| `wiki.style_nodes` | 20 | Mirrors public.style_nodes |
| `wiki.brand_nodes` | ~2899 | Mirrors public.brand_nodes; 1905 rows have `instagram_handle` (migration 003) |
| `wiki.brand_keywords` | ~26,366 | Derived from attributes jsonb |
| `wiki.brand_relations` | 0 | Filled by compute_relations.js |
| `wiki.style_node_adjacency` | 0 | Cluster-to-cluster edges |
| `wiki.brand_comments` | 0 | |
| `wiki.brand_instagram_posts` | ~36.8k | One row per post; `image_urls` = S3 public URLs (migration 004); backfilled by `scripts/ingest_instagram_posts.js` |

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
- Instagram feed images are now permanently stored in S3 (`kikoai-wiki-web/feed/*`); the legacy `public/feed-images/` local path is no longer written for new scrapes

### Linting

```bash
npm run lint     # ESLint 9 (flat config)
```

---

## Known Issues / Tech Debt

### Security (Priority: High)

| Issue | Location | Status / Mitigation |
|-------|----------|---------------------|
| All write/delete API routes unauthenticated | `app/api/brands/`, `app/api/comments/` | **Mitigated (view-only)**: `lib/write-guard.ts` returns 403 on all mutating routes unless `WIKI_WRITE_ENABLED=true`. Auth (next-auth) must be wired before writes can be re-enabled. |
| `refresh-instagram` unauthenticated + cost-abuse | `app/api/brands/[id]/refresh-instagram/` | **Mitigated (view-only + rate limit)**: write-guard blocks the route; `proxy.ts` enforces 2 req/min per IP even if guard were lifted. |
| SSRF in `/api/proxy-image` | `app/api/proxy-image/` | **Mitigated**: `lib/url-guard.ts` enforces Instagram/Facebook CDN allowlist + DNS rebinding check + `redirect: "manual"`; `Access-Control-Allow-Origin: *` removed. |
| No rate limiting | All API routes | **Mitigated**: `proxy.ts` (Next.js 16 middleware renamed from `middleware.ts`) applies per-IP sliding-window limits (60 req/min general, 2 req/min for refresh). In-memory only — must move to Redis/Upstash for multi-instance. |
| No input validation | Mutating API routes | **Mitigated**: `lib/validation.ts` (Zod v4) validates all request bodies; `isBigintId()` / `isUuid()` guard route params. |
| `next-auth` installed but not configured | No session usage | **Open**: Auth is a no-op. Required before enabling writes for end users. |
| `ssl.rejectUnauthorized: false` | `lib/db.ts` | **Open (dev only)**: set `DATABASE_CA_CERT` for cert-verified TLS; acceptable for dev, not for production. |
| Security headers missing | HTTP responses | **Mitigated**: `next.config.ts` adds CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. |

### Maintainability

| Issue | Location | Impact |
|-------|----------|--------|
| No migration runner | `database/migrations/` (manual apply) | Migrations must be applied by hand; no rollback automation |
| No tests | Entire codebase | No regression safety net for refactoring |
| `DATABASE_URL_SUPABASE_BACKUP` retained | `.env.local` | Points to decommissioned Supabase; can be removed |

### Architecture

| Issue | Notes |
|-------|-------|
| `brand_relations` and `style_node_adjacency` are empty | The graph's relation link types are defined but not populated; `compute_relations.js` script not yet run on the new dataset |
| `public/feed-images/` legacy local store | No longer written for new scrapes (S3 migration complete). Retained for any pre-migration locally-cached images; safe to clean up. |
| Cross-schema integration (wiki ↔ kikoai production) | `wiki.brand_nodes` already mirrors `public.brand_nodes` (ids identical). Deeper integration (live sync, write-back) is a future phase — requires explicit coordination to avoid touching `public`/`ai` schemas |
| Instagram thumbnails and feed posts | `scripts/ingest_instagram_posts.js` bulk-backfilled ~989 brands (~36.8k images) into S3 + `wiki.brand_instagram_posts`. Remaining ~916 brands (no handle or below confidence threshold) still have null `thumbnail_url`. |
