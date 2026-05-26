-- 003_propagate_instagram_handles.sql
--
-- Purpose : Backfill wiki.brand_nodes.instagram_handle / instagram_url from the
--           enriched data that already lives in public.brand_nodes.wiki (jsonb).
--           The 002 migration intentionally left these NULL ("re-fetched later");
--           the handles are in fact already known in public, so no Apify discovery
--           is needed — only the actual feed images get fetched later.
--
--           Source  : public.brand_nodes.wiki ->> 'instagram_handle' / 'instagram_url'
--           Filter  : status = 'ok' AND non-empty handle (1905 brands as of 2026-05-25)
--           Target  : wiki.brand_nodes.instagram_handle / instagram_url
--
-- Owner   : app_user owns `wiki` (DDL/DML); has SELECT on `public`.
-- Date    : 2026-05-25
--
-- Safety  : Single transaction. id space is shared (public ids preserved into wiki),
--           so the join is a straight id match. Idempotent: re-running just rewrites
--           the same values. Handle is lower/trimmed defensively even though the
--           public values are already clean.

BEGIN;

UPDATE wiki.brand_nodes wb
SET instagram_handle = lower(trim(pb.wiki->>'instagram_handle')),
    instagram_url    = NULLIF(trim(pb.wiki->>'instagram_url'), ''),
    updated_at       = now()
FROM public.brand_nodes pb
WHERE pb.id = wb.id
  AND pb.wiki->>'status' = 'ok'
  AND NULLIF(trim(pb.wiki->>'instagram_handle'), '') IS NOT NULL;

COMMIT;
