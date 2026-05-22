# structure.md — kikoweb

> Created: 2026-05-22 | Status: Active Development
> Purpose: Directory map and module organization reference
> Verified against: `ls` + lib/db.ts, lib/repositories/, lib/types.ts (2026-05-22 refactor)

---

## Top-Level Directory Tree

```
kikoweb/
├── app/                    # Next.js App Router (pages + API routes)
├── components/             # React UI components
├── lib/                    # Shared utilities, DB client, repositories, types
├── database/               # Raw SQL migrations (database/migrations/001_init_wiki_schema.sql)
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
    ├── nodes/              # GET  — brand node (cluster) list
    ├── brands/
    │   ├── route.ts        # GET list, POST create brand
    │   ├── check-dup/      # POST — duplicate name check before create
    │   └── [id]/
    │       ├── route.ts          # GET, PUT, DELETE single brand
    │       ├── comments/         # GET list, POST create comment
    │       └── refresh-instagram/ # POST — trigger Apify scrape + image download
    ├── comments/
    │   └── [id]/           # DELETE single comment
    └── proxy-image/        # GET — proxy arbitrary external image URL (SSRF risk)
```

### API Route Summary

| Route | Method(s) | Purpose | Auth Required |
|-------|-----------|---------|--------------|
| `/api/graph` | GET | Full graph payload | No |
| `/api/nodes` | GET | Cluster list | No |
| `/api/brands` | GET, POST | Brand list + create | No (debt) |
| `/api/brands/check-dup` | POST | Duplicate check | No |
| `/api/brands/[id]` | GET, PUT, DELETE | Brand CRUD | No (debt) |
| `/api/brands/[id]/comments` | GET, POST | Comment list + create | No (debt) |
| `/api/brands/[id]/refresh-instagram` | POST | Apify scrape trigger | No (debt) |
| `/api/comments/[id]` | DELETE | Delete comment | No (debt) |
| `/api/proxy-image` | GET | Image proxy | No (SSRF risk) |

---

## `components/` — React Components

```
components/
├── graph/
│   └── GraphCanvas.tsx     # ★ Core: react-force-graph-2d canvas, 2-phase d3 sim
│                           #   Phase 1: settle all nodes; Phase 2: per-cluster clockwise rotation
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
| `lib/db.ts` | `pg.Pool` singleton; strips `sslmode`, sets `ssl.rejectUnauthorized: false`, `search_path=wiki`; `server-only` |
| `lib/types.ts` | Plain camelCase row interfaces: `BrandNode`, `Brand`, `BrandKeyword`, `BrandRelation`, `NodeRelation`, `BrandComment`; composite types `BrandWithDetail`, `BrandWithNodeKeywords` |
| `lib/repositories/graph.ts` | Full graph payload query (nodes + brands + all link rows) |
| `lib/repositories/nodes.ts` | `BrandNode` list queries |
| `lib/repositories/brands.ts` | Brand CRUD: list, get with keywords/comments, create, update, delete |
| `lib/repositories/comments.ts` | Comment list, create, delete |
| `lib/graph-utils.ts` | `buildGraphData()` — DB rows → graph nodes + 3 link types for the canvas |
| `lib/store.ts` | Zustand 5 store: `selectedClusterId`, `focusedBrandId`, `getCatOpen`, `locale` |
| `lib/i18n.ts` | Translation lookup keyed by `locale` (`en` \| `ko`) |
| `lib/cluster-labels.ts` | Bilingual display labels for the 15 brand nodes |
| `lib/brand-descriptions.ts` | Bilingual descriptive copy per brand |
| `lib/image-storage.ts` | Download Instagram CDN images → `public/feed-images/{slug}/`, slugify filenames |

---

## `database/` — SQL Migrations

```
database/
└── migrations/
    └── 001_init_wiki_schema.sql   # Baseline: full wiki schema DDL (BEGIN;…COMMIT;)
                                   # Future changes: 002_…, 003_… numbered files
```

### Data Tables (wiki schema)

| Table | Row Count (2026-05-22) |
|-------|----------------------|
| `wiki.brand_nodes` | 15 |
| `wiki.brands` | 1079 |
| `wiki.brand_keywords` | 3495 |
| `wiki.brand_relations` | 0 |
| `wiki.node_relations` | 0 |
| `wiki.brand_comments` | 0 |

All PKs: `UUID` via `gen_random_uuid()`. DB schema isolated to `wiki` (see tech.md).

---

## Graph Link Types

The 3 link types produced by `lib/graph-utils.ts` → `buildGraphData()`:

| Type | Source → Target | Data origin | Rendered as |
|------|----------------|-------------|-------------|
| `cluster-member` | `Brand` → `BrandNode` | `Brand.nodeId` FK | Thin grey edges |
| `brand-relation` | `Brand` ↔ `Brand` | `BrandRelation` table | Weighted coloured edges |
| `node-relation` | `BrandNode` ↔ `BrandNode` | `NodeRelation` table | Thick cluster-to-cluster edges |

Note: `brand-relation` and `node-relation` tables are currently empty (0 rows). Only `cluster-member` links are active in the live graph.

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
| `Fashion_genome…xlsx` | Source spreadsheet for the 15 cluster taxonomy |

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
