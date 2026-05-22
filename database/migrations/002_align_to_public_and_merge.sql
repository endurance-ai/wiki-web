-- 002_align_to_public_and_merge.sql
--
-- Purpose : Realign the kikoweb `wiki` schema to MIRROR the `public` schema and
--           merge public's brand data in, so the brand-wiki app graphs the real
--           ~2899-brand fashion genome (32+ malls) instead of the 1079-brand
--           Apify-seeded throwaway set.
--
--           The original wiki schema had CROSSED naming vs public:
--             - wiki.brands       (uuid)  -> was the BRAND table
--             - wiki.brand_nodes  (uuid)  -> was actually STYLE CLUSTERS (15 rows)
--           This migration fixes that to match public's vocabulary:
--             - wiki.style_nodes  (bigint) = style clusters (mirrors public.style_nodes)
--             - wiki.brand_nodes  (bigint) = brands         (mirrors public.brand_nodes)
--
--           The old wiki data is DISPOSABLE (Apify thumbnails get re-fetched later),
--           so we DROP and rebuild from public. We only READ public; we never write it.
--
--           Wiki-only viz columns are added on top of the public mirror:
--             - style_nodes.color                       (graph cluster color)
--             - brand_nodes.thumbnail_url / feed_thumbnails  (re-fetched via Apify later)
--             - brand_nodes.x_position / y_position     (from public.brand_multimodal_umap)
--
-- Owner   : app_user owns the `wiki` schema (full DDL); has SELECT on `public`.
-- Date    : 2026-05-22
--
-- Safety  : Single transaction. Cross-schema INSERT…SELECT preserves public ids so
--           FK references (primary_style_node_id, brand_keywords.brand_id) align.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) DROP the old wiki tables (FK-respecting order: edges/children first).
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS wiki.brand_comments       CASCADE;
DROP TABLE IF EXISTS wiki.brand_keywords       CASCADE;
DROP TABLE IF EXISTS wiki.brand_relations      CASCADE;
DROP TABLE IF EXISTS wiki.node_relations       CASCADE;  -- old; replaced by style_node_adjacency
DROP TABLE IF EXISTS wiki.style_node_adjacency CASCADE;  -- guard against re-run
DROP TABLE IF EXISTS wiki.brands               CASCADE;  -- old brand table (uuid)
DROP TABLE IF EXISTS wiki.brand_nodes          CASCADE;  -- old clusters table (uuid) / re-run guard
DROP TABLE IF EXISTS wiki.style_nodes          CASCADE;  -- re-run guard

-- ---------------------------------------------------------------------------
-- 2) CREATE the realigned tables (mirror public + wiki-only viz columns).
-- ---------------------------------------------------------------------------

-- Style clusters. Mirrors public.style_nodes + wiki-only `color` for graph rendering.
CREATE TABLE wiki.style_nodes (
  id           bigint       PRIMARY KEY,
  code         text         NOT NULL,
  name_en      text         NOT NULL,
  name_ko      text         NOT NULL,
  mood         text,
  include_rule text,
  exclude_rule text,
  keywords_en  text[]       NOT NULL DEFAULT '{}',
  keywords_ko  text[]       NOT NULL DEFAULT '{}',
  is_active    boolean      NOT NULL DEFAULT true,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now(),
  -- wiki-only:
  color        text
);

-- Brands. Mirrors public.brand_nodes + wiki-only viz columns.
CREATE TABLE wiki.brand_nodes (
  id                        bigint       PRIMARY KEY,
  brand_name                text         NOT NULL,
  brand_name_normalized     text         NOT NULL,
  gender_scope              text[],
  source_platforms          text[],
  attributes                jsonb        DEFAULT '{}'::jsonb,
  primary_style_node_id     bigint,
  secondary_style_node_id   bigint,
  style_node_confidence     numeric,
  style_node_assigned_at    timestamptz,
  style_node_assigned_model text,
  price_min_usd             numeric,
  price_max_usd             numeric,
  wiki                      jsonb,
  updated_at                timestamptz  DEFAULT now(),
  -- wiki-only viz columns (all Apify/UMAP-derived, re-fetched later):
  instagram_handle          text,
  instagram_url             text,
  thumbnail_url             text,
  feed_thumbnails           text[]       NOT NULL DEFAULT '{}',
  x_position                double precision,
  y_position                double precision,
  CONSTRAINT brand_nodes_primary_style_node_id_fkey
    FOREIGN KEY (primary_style_node_id) REFERENCES wiki.style_nodes (id)
);

-- Keyword tags per brand (derived from attributes jsonb). ON DELETE CASCADE.
CREATE TABLE wiki.brand_keywords (
  id       bigserial PRIMARY KEY,
  brand_id bigint    NOT NULL,
  keyword  text      NOT NULL,
  CONSTRAINT brand_keywords_brand_id_fkey
    FOREIGN KEY (brand_id) REFERENCES wiki.brand_nodes (id) ON DELETE CASCADE
);

-- Comments per brand. ON DELETE CASCADE. brand_id is bigint now.
CREATE TABLE wiki.brand_comments (
  id          uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id    bigint       NOT NULL,
  author_id   uuid,
  author_name varchar(100),
  content     text         NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT brand_comments_brand_id_fkey
    FOREIGN KEY (brand_id) REFERENCES wiki.brand_nodes (id) ON DELETE CASCADE
);

-- Brand <-> brand edges. Stays empty (filled later by compute_relations).
CREATE TABLE wiki.brand_relations (
  id            bigserial        PRIMARY KEY,
  brand_id_a    bigint           NOT NULL,
  brand_id_b    bigint           NOT NULL,
  strength      double precision NOT NULL DEFAULT 1,
  relation_type varchar(50),
  CONSTRAINT brand_relations_brand_id_a_fkey
    FOREIGN KEY (brand_id_a) REFERENCES wiki.brand_nodes (id) ON DELETE CASCADE,
  CONSTRAINT brand_relations_brand_id_b_fkey
    FOREIGN KEY (brand_id_b) REFERENCES wiki.brand_nodes (id) ON DELETE CASCADE
);

-- Cluster <-> cluster edges. Mirrors public.style_node_adjacency. Stays empty.
CREATE TABLE wiki.style_node_adjacency (
  from_id    bigint       NOT NULL,
  to_id      bigint       NOT NULL,
  weight     numeric      NOT NULL DEFAULT 1,
  source     text         NOT NULL DEFAULT 'embedding_derived',
  updated_at timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT style_node_adjacency_from_id_fkey
    FOREIGN KEY (from_id) REFERENCES wiki.style_nodes (id) ON DELETE CASCADE,
  CONSTRAINT style_node_adjacency_to_id_fkey
    FOREIGN KEY (to_id)   REFERENCES wiki.style_nodes (id) ON DELETE CASCADE
);

-- Helpful indexes for the graph/list queries.
CREATE INDEX brand_nodes_primary_style_node_id_idx ON wiki.brand_nodes (primary_style_node_id);
CREATE INDEX brand_keywords_brand_id_idx           ON wiki.brand_keywords (brand_id);
CREATE INDEX brand_comments_brand_id_idx           ON wiki.brand_comments (brand_id);

-- ---------------------------------------------------------------------------
-- 3) MERGE data from public (cross-schema, ids preserved so refs align).
-- ---------------------------------------------------------------------------

-- 3a) style_nodes (20 rows) + deterministic distinct palette.
--     Colors are generated by golden-angle hue rotation keyed on a stable 0-based
--     ordinal (ROW_NUMBER over id), giving 20 visually distinct, evenly-spaced hues.
--     A small lightness/saturation jitter on alternating rows further separates
--     neighbours. HSL -> RGB -> #RRGGBB computed inline in SQL.
INSERT INTO wiki.style_nodes
  (id, code, name_en, name_ko, mood, include_rule, exclude_rule,
   keywords_en, keywords_ko, is_active, created_at, updated_at, color)
SELECT s.id, s.code, s.name_en, s.name_ko, s.mood, s.include_rule, s.exclude_rule,
       s.keywords_en, s.keywords_ko, s.is_active, s.created_at, s.updated_at,
       (
         -- HSL(h, sat, light) -> hex. h spaced by golden angle (137.508 deg).
         WITH hsl AS (
           SELECT
             ((ord * 137.508)::numeric % 360.0)                         AS h,
             (CASE WHEN ord % 2 = 0 THEN 0.62 ELSE 0.74 END)            AS s,
             (CASE WHEN ord % 3 = 0 THEN 0.46 WHEN ord % 3 = 1 THEN 0.56 ELSE 0.66 END) AS l
         ),
         rgb AS (
           SELECT
             -- chroma c, second-largest x, match m
             (1 - abs(2 * l - 1)) * s                                   AS c,
             h / 60.0                                                    AS hp,
             l                                                          AS l
           FROM hsl
         ),
         comp AS (
           SELECT
             c,
             c * (1 - abs((hp::numeric % 2) - 1))                       AS x,
             l - c / 2                                                  AS m,
             hp
           FROM rgb
         ),
         chan AS (
           SELECT
             CASE
               WHEN hp < 1 THEN c   WHEN hp < 2 THEN x
               WHEN hp < 3 THEN 0   WHEN hp < 4 THEN 0
               WHEN hp < 5 THEN x   ELSE c END + m AS r,
             CASE
               WHEN hp < 1 THEN x   WHEN hp < 2 THEN c
               WHEN hp < 3 THEN c   WHEN hp < 4 THEN x
               WHEN hp < 5 THEN 0   ELSE 0 END + m AS g,
             CASE
               WHEN hp < 1 THEN 0   WHEN hp < 2 THEN 0
               WHEN hp < 3 THEN x   WHEN hp < 4 THEN c
               WHEN hp < 5 THEN c   ELSE x END + m AS b
           FROM comp
         )
         SELECT '#'
           || lpad(to_hex(greatest(0, least(255, round(r * 255)))::int), 2, '0')
           || lpad(to_hex(greatest(0, least(255, round(g * 255)))::int), 2, '0')
           || lpad(to_hex(greatest(0, least(255, round(b * 255)))::int), 2, '0')
         FROM chan
       ) AS color
FROM (
  SELECT *, (ROW_NUMBER() OVER (ORDER BY id) - 1) AS ord
  FROM public.style_nodes
) s;

-- 3b) brand_nodes (~2899). Copy public columns; viz columns: thumbnail/feed NULL/empty,
--     x/y from brand_multimodal_umap (LEFT JOIN, null when absent).
INSERT INTO wiki.brand_nodes
  (id, brand_name, brand_name_normalized, gender_scope, source_platforms, attributes,
   primary_style_node_id, secondary_style_node_id, style_node_confidence,
   style_node_assigned_at, style_node_assigned_model, price_min_usd, price_max_usd,
   wiki, updated_at, instagram_handle, instagram_url, thumbnail_url, feed_thumbnails,
   x_position, y_position)
SELECT b.id, b.brand_name, b.brand_name_normalized, b.gender_scope, b.source_platforms,
       b.attributes, b.primary_style_node_id, b.secondary_style_node_id,
       b.style_node_confidence, b.style_node_assigned_at, b.style_node_assigned_model,
       b.price_min_usd, b.price_max_usd, b.wiki, b.updated_at,
       NULL::text                AS instagram_handle,
       NULL::text                AS instagram_url,
       NULL::text                AS thumbnail_url,
       '{}'::text[]              AS feed_thumbnails,
       u.x::double precision     AS x_position,
       u.y::double precision     AS y_position
FROM public.brand_nodes b
LEFT JOIN public.brand_multimodal_umap u ON u.brand_id = b.id;

-- 3c) brand_keywords: flatten attributes arrays vibe/detail/palette/pattern/material/
--     silhouette into keyword rows. Lowercase + trim + dedup per brand. Skip null attrs
--     and skip array elements that are not present / not arrays.
INSERT INTO wiki.brand_keywords (brand_id, keyword)
SELECT DISTINCT b.id, lower(trim(kw.val)) AS keyword
FROM wiki.brand_nodes b
CROSS JOIN LATERAL (
  SELECT key
  FROM unnest(ARRAY['vibe','detail','palette','pattern','material','silhouette']) AS key
) keys
CROSS JOIN LATERAL (
  SELECT jsonb_array_elements_text(b.attributes -> keys.key) AS val
  WHERE jsonb_typeof(b.attributes -> keys.key) = 'array'
) kw
WHERE b.attributes IS NOT NULL
  AND b.attributes <> '{}'::jsonb
  AND trim(kw.val) <> '';

-- ---------------------------------------------------------------------------
-- 4) Reset sequences for the wiki-only bigserial PKs (brand_keywords,
--    brand_relations). brand_nodes/style_nodes ids come straight from public
--    (no sequence ownership in wiki), so nothing to reset there.
-- ---------------------------------------------------------------------------
SELECT setval(
  pg_get_serial_sequence('wiki.brand_keywords', 'id'),
  COALESCE((SELECT max(id) FROM wiki.brand_keywords), 1)
);
-- brand_relations is empty; leave its sequence at default start.

COMMIT;
