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
├── database/               # Raw SQL migrations (001_init_wiki_schema.sql, 002_align_to_public_and_merge.sql)
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
    │       ├── route.ts          # GET, PUT, DELETE single brand
    │       ├── comments/         # GET list, POST create comment
    │       └── refresh-instagram/ # POST — trigger Apify scrape + image download
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
| `/api/brands/[id]` | GET, PUT, DELETE | Brand CRUD | GET: No; PUT/DELETE: **403 (write-guard)** |
| `/api/brands/[id]/comments` | GET, POST | Comment list + create | GET: No; POST: **403 (write-guard)** |
| `/api/brands/[id]/refresh-instagram` | POST | Apify scrape trigger | **403 (write-guard)** |
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
| `lib/types.ts` | Plain camelCase row interfaces: `StyleNode` (cluster), `BrandNode` (brand), `BrandKeyword`, `BrandRelation`, `StyleNodeAdjacency`, `BrandComment`; composite types `BrandWithDetail`, `BrandWithNodeKeywords` |
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
| `lib/image-storage.ts` | Download Instagram CDN images → `public/feed-images/{slug}/`; uses `assertSafeRemoteUrl` guard |

---

## `database/` — SQL Migrations

```
database/
└── migrations/
    ├── 001_init_wiki_schema.sql            # Baseline schema (historic; idempotent, safe to re-run)
    └── 002_align_to_public_and_merge.sql   # Realigns to public schema, imports ~2899 brands + 20 clusters
```

### Data Tables (wiki schema — post-002 migration)

| Table | Rows (after 002) | PK type | Notes |
|-------|-----------------|---------|-------|
| `wiki.style_nodes` | 20 | bigint (mirrors `public.style_nodes.id`) | Style clusters |
| `wiki.brand_nodes` | ~2899 | bigint (mirrors `public.brand_nodes.id`) | Brands |
| `wiki.brand_keywords` | ~26,366 | bigserial | Derived from `attributes` jsonb |
| `wiki.brand_relations` | 0 | bigserial | Filled by `compute_relations.js` |
| `wiki.style_node_adjacency` | 0 | (from_id, to_id) | Cluster-to-cluster edges |
| `wiki.brand_comments` | 0 | uuid | FK brand_id now bigint |

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
    └── {brand-slug}/       # Downloaded Instagram feed thumbnails (gitignored)
                            # Written by lib/image-storage.ts at runtime
```

---

## `docs/`

```
docs/
└── DESIGN_SYSTEM.md        # UI/UX design system reference
```
