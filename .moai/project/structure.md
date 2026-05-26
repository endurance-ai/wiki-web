# structure.md — kikoweb

> Created: 2026-05-22 | Status: Active Development
> Purpose: Directory map and module organization reference
> Verified against: `ls` + lib/db.ts, lib/repositories/, lib/types.ts, database/migrations/002_align_to_public_and_merge.sql (feature/mig branch)

---

## Top-Level Directory Tree

```
kikoweb/
├── app/                    # Next.js App Router (pages + API routes)
├── components/             # React UI components
├── lib/                    # Shared utilities, DB client, repositories, types
├── database/               # Raw SQL migrations (001–004)
├── public/                 # Static assets + downloaded feed images
├── scripts/                # One-off data utilities (Node.js, not imported by app)
├── docs/                   # Design documentation
├── .moai/                  # MoAI scaffolding (specs, project docs, config)
├── .claude/                # Claude Code rules and skills
├── .env.local              # Runtime secrets (gitignored)
├── package.json            # Dependencies + scripts (dev runs on port 3500)
├── tsconfig.json           # TypeScript config
├── next.config.ts          # Next.js config (Turbopack enabled)
└── postcss.config.mjs      # Tailwind CSS v4 via @tailwindcss/postcss
```

---

## `app/` — App Router

```
app/
├── layout.tsx              # Root layout: fonts, global CSS, providers
├── page.tsx                # Single-page app: GraphCanvas (70vh) + BottomPanel + modals
├── globals.css             # Tailwind base + custom CSS variables
└── api/
    ├── graph/              # GET  — full graph data (nodes + brands + all links)
    ├── nodes/              # GET  — style node (cluster) list
    ├── brands/
    │   ├── route.ts        # GET list, POST create brand
    │   ├── check-dup/      # POST — duplicate name check before create
    │   └── [id]/
    │       ├── route.ts          # GET (returns brand + posts[]), PUT, DELETE single brand
    │       ├── comments/         # GET list, POST create comment
    │       └── refresh-instagram/ # POST — Apify scrape → S3 upload → wiki.brand_instagram_posts upsert
    ├── comments/
    │   └── [id]/           # DELETE single comment
    └── proxy-image/        # GET — proxy Instagram/Facebook CDN images (SSRF guard via url-guard.ts)
```

### API Route Summary

| Route | Method(s) | Purpose | Auth Required |
|-------|-----------|---------|--------------|
| `/api/graph` | GET | Full graph payload | No |
| `/api/nodes` | GET | Cluster list | No |
| `/api/brands` | GET, POST | Brand list + create | GET: No; POST: **403 (write-guard)** |
| `/api/brands/check-dup` | POST | Duplicate check | No |
| `/api/brands/[id]` | GET, PUT, DELETE | Brand CRUD; GET also returns `posts[]` | GET: No; PUT/DELETE: **403 (write-guard)** |
| `/api/brands/[id]/comments` | GET, POST | Comment list + create | GET: No; POST: **403 (write-guard)** |
| `/api/brands/[id]/refresh-instagram` | POST | Apify scrape → S3 → brand_instagram_posts replace | **403 (write-guard)** |
| `/api/comments/[id]` | DELETE | Delete comment | **403 (write-guard)** |
| `/api/proxy-image` | GET | Instagram/Facebook CDN image proxy | No (SSRF allowlist enforced) |

---

## `components/` — React Components

```
components/
├── graph/
│   └── GraphCanvas.tsx     # ★ Core: react-force-graph-2d canvas, deterministic ring layout + rotation
│                           #   Clusters placed on ring proportional to rMax, brands locked via fx/fy, rotate from tick 1
│                           #   Renders brand thumbnails as circles on canvas
└── panel/
    ├── BottomPanel.tsx     # Fixed bottom bar: cluster filter, locale, music toggle
    ├── BrandPopup.tsx      # Brand detail panel — feed, keywords, relations, comments (triggered on click)
    ├── AskKikoAI.tsx       # AI assistant panel placeholder
    ├── GetYourCat.tsx      # Style quiz / cluster recommendation UI
    ├── LocaleToggle.tsx    # EN / KR switcher (reads/writes Zustand locale)
    └── MusicToggle.tsx     # Ambient music on/off toggle
```

---

## `lib/` — Shared Logic

| File | Purpose |
|------|---------|
| `lib/db.ts` | `pg.Pool` singleton; strips `sslmode`/`schema`, sets `ssl.rejectUnauthorized: false` (or `DATABASE_CA_CERT` path), `search_path=wiki`; `server-only` |
| `lib/types.ts` | Plain camelCase row interfaces: `StyleNode` (cluster), `BrandNode` (brand), `BrandKeyword`, `BrandRelation`, `StyleNodeAdjacency`, `BrandComment`, `BrandInstagramPost`; composite types `BrandWithDetail`, `BrandWithNodeKeywords` |
| `lib/repositories/graph.ts` | Full graph payload query (`style_nodes` + `brand_nodes` + `brand_relations` + `style_node_adjacency`) |
| `lib/repositories/nodes.ts` | `StyleNode` list queries |
| `lib/repositories/brands.ts` | Brand CRUD: list, get with keywords/comments, create, update, delete (targets `brand_nodes`) |
| `lib/repositories/comments.ts` | Comment list, create, delete |
| `lib/graph-utils.ts` | `buildGraphData()` — DB rows → graph nodes + 3 link types for the canvas; UMAP coords normalised per-cluster to [-1,+1] axisX/Y |
| `lib/write-guard.ts` | `writesDisabled()` — returns 403 unless `WIKI_WRITE_ENABLED=true`; all mutating routes call this first |
| `lib/url-guard.ts` | `assertSafeRemoteUrl()` — SSRF allowlist (Instagram/Facebook CDN) + DNS rebinding check; used by proxy-image and image-storage |
| `lib/validation.ts` | Zod schemas for all mutating route bodies; `isBigintId()` / `isUuid()` param validators; `safeHref()` for instagramUrl |
| `lib/rate-limit.ts` | In-memory sliding-window rate limiter backing `proxy.ts` |
| `lib/store.ts` | Zustand 5 store: `selectedClusterId`, `focusedBrandId`, `getCatOpen`, `locale` |
| `lib/i18n.ts` | Translation lookup keyed by `locale` (`en` \| `ko`) |
| `lib/cluster-labels.ts` | Bilingual display labels for the 20 style nodes (keyed by `name_ko`) |
| `lib/brand-descriptions.ts` | Bilingual descriptive copy per brand |
| `lib/s3.ts` | Shared S3 client (`@aws-sdk/client-s3`) + `putFeedObject()` — uploads to `kikoai-wiki-web/feed/*` and returns public URL; `server-only` |
| `lib/instagram.ts` | `extractPosts(profile, limit)` — Apify profile response → `ScrapedPost[]`; preserves all carousel images |
| `lib/image-src.ts` | `thumbSrc(url)` — S3 bucket host → direct URL; `/` path → passthrough; other → `/api/proxy-image`; single source of truth shared by BrandPopup, BottomPanel, GraphCanvas |
| `lib/repositories/posts.ts` | `getBrandPosts()` / `replaceBrandPosts()` — `wiki.brand_instagram_posts` CRUD; `server-only` |
| `lib/image-storage.ts` | `uploadRemoteImagesToS3()` — download Instagram CDN image → upload to S3 `feed/` prefix (SSRF-guarded). Legacy `downloadFeedImages()` (local disk) retained for compatibility. |

---

## `database/` — SQL Migrations

```
database/
└── migrations/
    ├── 001_init_wiki_schema.sql                    # Baseline schema (historic; idempotent, safe to re-run)
    ├── 002_align_to_public_and_merge.sql           # Realigns to public schema, imports ~2899 brands + 20 clusters
    ├── 003_propagate_instagram_handles.sql         # Backfills instagram_handle/url from public.brand_nodes.wiki (1905 brands)
    └── 004_brand_instagram_posts.sql               # New table wiki.brand_instagram_posts (S3 image_urls[], UNIQUE(brand_id, shortcode))
```

Apply with: `node scripts/apply_migration.js <filename.sql>`

### Data Tables (wiki schema — post-004 migration)

| Table | Rows | PK type | Notes |
|-------|------|---------|-------|
| `wiki.style_nodes` | 20 | bigint (mirrors `public.style_nodes.id`) | Style clusters |
| `wiki.brand_nodes` | ~2899 | bigint (mirrors `public.brand_nodes.id`) | Brands; 1905 have `instagram_handle` |
| `wiki.brand_keywords` | ~26,366 | bigserial | Derived from `attributes` jsonb |
| `wiki.brand_relations` | 0 | bigserial | Filled by `compute_relations.js` |
| `wiki.style_node_adjacency` | 0 | (from_id, to_id) | Cluster-to-cluster edges |
| `wiki.brand_comments` | 0 | uuid | FK brand_id now bigint |
| `wiki.brand_instagram_posts` | ~36.8k | bigserial | One row per post; `image_urls text[]` = S3 public URLs (cover = `[1]`); backfilled by `scripts/ingest_instagram_posts.js` |

bigint ids are cast `::text` in repositories so the frontend / force-graph uses string ids throughout. DB schema isolated to `wiki` (see tech.md).

---

## Graph Link Types

The 3 link types produced by `lib/graph-utils.ts` → `buildGraphData()`:

| Type | Source → Target | Data origin | Rendered as |
|------|----------------|-------------|-------------|
| `cluster-member` | `brand_nodes` → `style_nodes` | `brand_nodes.primary_style_node_id` | Coloured spokes (cluster colour, shown on cluster select) |
| `brand-relation` | `brand_nodes` ↔ `brand_nodes` | `wiki.brand_relations` table | Weighted coloured edges |
| `node-relation` | `style_nodes` ↔ `style_nodes` | `wiki.style_node_adjacency` table | Thick cluster-to-cluster edges |

Note: `brand-relation` and `style_node_adjacency` tables are currently empty (0 rows). Only `cluster-member` links are active in the live graph. Brand nodes in the force-graph carry a `"b"` prefix on their id to avoid integer id collisions with style node ids.

---

## `scripts/` — Data Utilities (Not App Code)

| Script | Purpose |
|--------|---------|
| `compute_relations.js` | Compute brand similarity and write `BrandRelation` rows |
| `fetch_thumbnails.js` | Bulk-download Instagram thumbnails for all brands |
| `ingest_wiki_instagram.js` | Ingest new Instagram profile data into wiki schema |
| `ingest_instagram_posts.js` | **Bulk Apify → S3 → `wiki.brand_instagram_posts` backfill** (~989 brands, ~36.8k images). Dry-run by default; `--live` to execute. Reads `DATABASE_URL`, `APIFY_TOKEN`, S3 env from `.env.local`. |
| `apply_migration.js` | Raw SQL migration runner — reads `DATABASE_URL` from `.env.local`, applies a single `database/migrations/*.sql` file in one transaction. |
| `manual_fetch.js` | One-off manual fetch helper |
| `migrate_to_local.js` | Migrated data from Supabase → dev-app wiki schema (decommissioned) |
| `seed_e_node_axes.js` | Seed axis labels for brand nodes |
| `Fashion_genome…xlsx` | Source spreadsheet for the original 15-cluster taxonomy (superseded by public.style_nodes 20-cluster set) |

All scripts read `DATABASE_URL` from environment (`.env.local` or shell).

---

## `public/` — Static Assets

```
public/
└── feed-images/
    └── {brand-slug}/       # Legacy locally-downloaded thumbnails (gitignored).
                            # No longer written for new scrapes (S3 migration complete 2026-05-25).
                            # Retained for any pre-migration cached images; safe to clean up.
```

---

## `docs/`

```
docs/
└── DESIGN_SYSTEM.md        # UI/UX design system reference
```
