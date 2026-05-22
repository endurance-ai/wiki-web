-- 001_init_wiki_schema.sql
--
-- Purpose : Baseline schema for the kikoweb brand-wiki app, living in the `wiki`
--           schema of the dev-app Postgres. 6 tables: brand_nodes (clusters),
--           brands, brand_keywords, brand_relations, node_relations, brand_comments.
--
-- Author note : This is a BASELINE migration. The schema was already applied to
--           the dev-app `wiki` schema via a prior `prisma db push` (before the
--           Prisma -> raw pg migration). This file is HISTORY / reproducibility
--           only and is safe to NOT execute against dev-app — every statement is
--           idempotent (IF NOT EXISTS) so re-running is a no-op on the live DB.
--           Going forward, new schema changes get their own NNN_*.sql file here.
--
-- Date    : 2026-05-22
--
-- Mirrors : the former prisma/schema.prisma (deleted in the same refactor).
--           Column types/nullability, UUID defaults, unique constraints, and FK
--           ON DELETE behavior match the Prisma models exactly.

BEGIN;

CREATE SCHEMA IF NOT EXISTS wiki;

-- Clusters / nodes. Brands hang off a node via brands.node_id.
CREATE TABLE IF NOT EXISTS wiki.brand_nodes (
  id            uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  name          varchar(100) NOT NULL UNIQUE,
  description   text,
  color         varchar(7),
  created_at    timestamptz  NOT NULL DEFAULT now(),
  axis_x_label  varchar(100),
  axis_y_label  varchar(100)
);

-- Brands. node_id is a nullable FK to brand_nodes (no cascade — matches Prisma default).
CREATE TABLE IF NOT EXISTS wiki.brands (
  id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  name             varchar(100) NOT NULL UNIQUE,
  instagram_handle varchar(100),
  thumbnail_url    text,
  node_id          uuid,
  x_position       double precision,
  y_position       double precision,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),
  instagram_url    text,
  feed_thumbnails  text[]       NOT NULL DEFAULT '{}',
  CONSTRAINT brands_node_id_fkey
    FOREIGN KEY (node_id) REFERENCES wiki.brand_nodes (id)
);

-- Keyword tags per brand. ON DELETE CASCADE (matches Prisma onDelete: Cascade).
CREATE TABLE IF NOT EXISTS wiki.brand_keywords (
  id       uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid         NOT NULL,
  keyword  varchar(100) NOT NULL,
  CONSTRAINT brand_keywords_brand_id_fkey
    FOREIGN KEY (brand_id) REFERENCES wiki.brands (id) ON DELETE CASCADE
);

-- Brand <-> brand edges. Both FKs ON DELETE CASCADE (matches Prisma).
CREATE TABLE IF NOT EXISTS wiki.brand_relations (
  id            uuid             DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id_a    uuid             NOT NULL,
  brand_id_b    uuid             NOT NULL,
  strength      double precision NOT NULL DEFAULT 1.0,
  relation_type varchar(50),
  CONSTRAINT brand_relations_brand_id_a_fkey
    FOREIGN KEY (brand_id_a) REFERENCES wiki.brands (id) ON DELETE CASCADE,
  CONSTRAINT brand_relations_brand_id_b_fkey
    FOREIGN KEY (brand_id_b) REFERENCES wiki.brands (id) ON DELETE CASCADE
);

-- Node <-> node edges. FKs have NO cascade (Prisma default RESTRICT).
CREATE TABLE IF NOT EXISTS wiki.node_relations (
  id        uuid             DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id_a uuid             NOT NULL,
  node_id_b uuid             NOT NULL,
  strength  double precision NOT NULL DEFAULT 1.0,
  CONSTRAINT node_relations_node_id_a_fkey
    FOREIGN KEY (node_id_a) REFERENCES wiki.brand_nodes (id),
  CONSTRAINT node_relations_node_id_b_fkey
    FOREIGN KEY (node_id_b) REFERENCES wiki.brand_nodes (id)
);

-- Comments per brand. ON DELETE CASCADE (matches Prisma onDelete: Cascade).
CREATE TABLE IF NOT EXISTS wiki.brand_comments (
  id          uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id    uuid         NOT NULL,
  author_id   uuid,
  author_name varchar(100),
  content     text         NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT brand_comments_brand_id_fkey
    FOREIGN KEY (brand_id) REFERENCES wiki.brands (id) ON DELETE CASCADE
);

COMMIT;
