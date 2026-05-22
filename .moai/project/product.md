# product.md — kikoweb

> Created: 2026-05-22 | Status: Active Development
> Audience: kiko.ai team (internal) + fashion-interested end users
> Purpose: Product scope reference for SPEC authoring and feature planning
> Verified against: source code, interview.md, session analysis

---

## One-Line Description

kikoweb is a fashion brand node wiki that renders a force-directed graph of 15 style clusters containing ~1079 brand cards, letting users explore brand relationships and — in the next phase — collectively build the brand database.

---

## Target Audience

| Audience | Role | Primary Need |
|----------|------|-------------|
| kiko.ai team | Owners / curators | Maintain brand data, evolve the taxonomy, integrate with the kikoai recommendation engine |
| Fashion-interested end users | Readers / contributors (roadmap) | Discover unknown brands, understand style clusters, contribute knowledge |

---

## Core Features (Current — v0.1)

### Graph Visualization

- Force-directed canvas graph (`react-force-graph-2d` + custom `d3-force`) rendered at 70 vh
- 15 style cluster nodes ("brand nodes") with micro-coordinate positioning
- ~1079 brand cards floating as Instagram-thumbnail circles, clustered by `(xPosition, yPosition)`
- Per-cluster clockwise rotation animation (2-phase d3 simulation: settle then rotate)
- 3 link types rendered on canvas: `cluster-member` (brand → node), `brand-relation` (brand ↔ brand), `node-relation` (node ↔ node)

### Brand Detail Popup

- Panel triggered on brand card click (`components/panel/BrandPopup.tsx`)
- Displays: Instagram feed thumbnails (locally cached in `public/feed-images/`), style keywords, related brands, comments thread

### Instagram Feed Ingestion

- Apify actor scrapes Instagram profiles on demand (`/api/brands/[id]/refresh-instagram`)
- Images downloaded from Instagram CDN to `public/feed-images/{slug}/` (permanent local storage via `lib/image-storage.ts`)
- DB stores local `/feed-images/...` paths in `Brand.feedThumbnails[]`

### Comments

- Per-brand threaded comments stored in `wiki.brand_comments`
- GET/POST via `/api/brands/[id]/comments/`, DELETE via `/api/comments/[id]/`
- `authorName` is a free-text field (no auth enforcement yet — see Known Issues)

### Internationalization (i18n)

- EN / KR locale toggle (`lib/i18n.ts`, `components/panel/LocaleToggle.tsx`)
- Zustand store (`lib/store.ts`) holds `locale` state
- Cluster labels localized (`lib/cluster-labels.ts`); brand descriptions bilingual (`lib/brand-descriptions.ts`)

---

## Use Cases

| Use Case | Actor | Supported Today |
|----------|-------|----------------|
| Explore style clusters visually | End user | Yes |
| Open a brand and see its Instagram feed | End user | Yes |
| Read / write comments on a brand | End user | Read: Yes / Write: Yes (unauthenticated — debt) |
| Add or edit a brand | Team curator | Yes via API (unauthenticated — debt) |
| Refresh Instagram thumbnails | Team curator | Yes via API (cost-unrestricted — debt) |
| Switch UI language EN ↔ KR | Any user | Yes |
| Query kikoai recommendation graph from wiki | System integration | Future phase |

---

## Participatory Wiki Roadmap

The near-term evolution from read-only viewer to collaborative wiki:

1. **Auth hardening** — configure next-auth, lock all write/delete/refresh routes behind session
2. **User-contributed brands** — authenticated POST `/api/brands/` flow with duplicate check (`/api/brands/check-dup/`)
3. **Keyword + relation editing** — UI for adding/removing `BrandKeyword` and `BrandRelation` records
4. **Moderated comments** — author attribution via session, admin delete
5. **Cross-schema integration** — link `wiki.brand_nodes` into kikoai's production brand graph (separate from `public`/`ai` schemas — requires coordination with kikoai team)
6. **Public launch** — deploy to production domain (currently dev-only on Vercel + dev-app EC2)

---

## Out of Scope (Current Phase)

- Merging wiki data into kikoai's `public` or `ai` schema tables
- Payment, commerce, or affiliate features
- Mobile-native application
- Real-time collaborative editing (WebSocket)
