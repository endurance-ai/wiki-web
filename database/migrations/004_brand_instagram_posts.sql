-- 004_brand_instagram_posts.sql
--
-- Purpose : Store the full Instagram feed per brand at POST granularity, so the
--           one-time Apify scrape (paid per profile) is captured structurally and
--           never has to be repeated to change how the feed is displayed.
--
--           One row = one Instagram post. Carousel children are kept as an ordered
--           array of S3 image URLs on the row (2-7 typically), preserving the
--           post -> images grouping without a second table. Cover image = image_urls[1].
--
--           Replaces the flat brand_nodes.feed_thumbnails text[] as the source of
--           truth for the gallery. feed_thumbnails is kept (untouched) for backward
--           compatibility with the existing single-brand refresh path until the UI
--           migrates over.
--
-- Owner   : app_user owns `wiki`.
-- Date    : 2026-05-25
--
-- Safety  : Single transaction, IF NOT EXISTS guards so it is a no-op on re-run.
--           UNIQUE(brand_id, shortcode) makes re-scraping a brand idempotent via
--           ON CONFLICT upsert in the repository.

BEGIN;

CREATE TABLE IF NOT EXISTS wiki.brand_instagram_posts (
  id             bigserial    PRIMARY KEY,
  brand_id       bigint       NOT NULL,
  shortcode      text         NOT NULL,              -- instagram.com/p/{shortcode}
  post_url       text,
  type           text,                               -- Image | Sidecar | Video
  caption        text,
  image_urls     text[]       NOT NULL DEFAULT '{}', -- S3 public URLs, ordered; cover = [1]
  likes_count    integer,
  comments_count integer,
  taken_at       timestamptz,                        -- post timestamp (from Apify)
  position       integer      NOT NULL DEFAULT 0,    -- 0..N display order (recency)
  scraped_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT brand_instagram_posts_brand_id_fkey
    FOREIGN KEY (brand_id) REFERENCES wiki.brand_nodes (id) ON DELETE CASCADE,
  CONSTRAINT brand_instagram_posts_brand_shortcode_key
    UNIQUE (brand_id, shortcode)
);

CREATE INDEX IF NOT EXISTS brand_instagram_posts_brand_id_idx
  ON wiki.brand_instagram_posts (brand_id, position);

COMMIT;
