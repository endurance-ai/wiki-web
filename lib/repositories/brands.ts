import "server-only";
import { pool } from "@/lib/db";
import type {
  BrandNode,
  BrandWithNode,
  BrandWithNodeKeywords,
  BrandWithDetail,
} from "@/lib/types";

// Base brand columns (camelCase aliased). Prefix `b.` so it composes inside JOINs.
// bigint ids -> ::text because the frontend uses string ids. brand_name -> name,
// primary_style_node_id -> nodeId to keep the pre-migration wire shape.
const BRAND_COLS = `
  b.id::text                    AS id,
  b.brand_name                  AS name,
  b.instagram_handle            AS "instagramHandle",
  b.instagram_url               AS "instagramUrl",
  b.thumbnail_url               AS "thumbnailUrl",
  b.primary_style_node_id::text AS "nodeId",
  b.x_position                  AS "xPosition",
  b.y_position                  AS "yPosition",
  b.updated_at                  AS "createdAt",
  b.updated_at                  AS "updatedAt",
  b.feed_thumbnails             AS "feedThumbnails"
`;

// Joined style cluster object (NULL when brand has no primary cluster), matching
// the pre-migration `node` include shape (now sourced from style_nodes).
const NODE_JSON = `
  CASE WHEN n.id IS NULL THEN NULL ELSE json_build_object(
    'id', n.id::text,
    'code', n.code,
    'name', n.name_ko,
    'nameEn', n.name_en,
    'color', n.color,
    'mood', n.mood,
    'description', n.mood,
    'isActive', n.is_active,
    'createdAt', n.created_at,
    'updatedAt', n.updated_at
  ) END AS "node"
`;

// Aggregated keywords array (empty array when none).
const KEYWORDS_JSON = `
  COALESCE(
    (SELECT json_agg(json_build_object('id', k.id::text, 'brandId', k.brand_id::text, 'keyword', k.keyword))
     FROM brand_keywords k WHERE k.brand_id = b.id),
    '[]'::json
  ) AS "keywords"
`;

export async function listBrands(): Promise<BrandWithNodeKeywords[]> {
  const res = await pool.query(
    `SELECT ${BRAND_COLS}, ${NODE_JSON}, ${KEYWORDS_JSON}
     FROM brand_nodes b
     LEFT JOIN style_nodes n ON n.id = b.primary_style_node_id
     ORDER BY b.brand_name ASC`
  );
  return res.rows as BrandWithNodeKeywords[];
}

export async function getBrandById(id: string): Promise<BrandWithDetail | null> {
  const res = await pool.query(
    `SELECT ${BRAND_COLS}, ${NODE_JSON}, ${KEYWORDS_JSON},
            COALESCE(
              (SELECT json_agg(json_build_object(
                 'id', c.id,
                 'brandId', c.brand_id::text,
                 'authorId', c.author_id,
                 'authorName', c.author_name,
                 'content', c.content,
                 'createdAt', c.created_at
               ) ORDER BY c.created_at DESC)
               FROM brand_comments c WHERE c.brand_id = b.id),
              '[]'::json
            ) AS "comments"
     FROM brand_nodes b
     LEFT JOIN style_nodes n ON n.id = b.primary_style_node_id
     WHERE b.id = $1`,
    [id]
  );
  if (res.rows.length === 0) return null;
  return res.rows[0] as BrandWithDetail;
}

// Re-fetch helper returning the node + keywords composite for a single brand.
async function getBrandWithNodeKeywords(
  id: string
): Promise<BrandWithNodeKeywords> {
  const res = await pool.query(
    `SELECT ${BRAND_COLS}, ${NODE_JSON}, ${KEYWORDS_JSON}
     FROM brand_nodes b
     LEFT JOIN style_nodes n ON n.id = b.primary_style_node_id
     WHERE b.id = $1`,
    [id]
  );
  return res.rows[0] as BrandWithNodeKeywords;
}

export async function createBrand({
  name,
  instagramHandle,
  nodeId,
  keywords,
}: {
  name: string;
  instagramHandle?: string | null;
  nodeId: string;
  keywords?: string[];
}): Promise<BrandWithNodeKeywords> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // brand_nodes.id is a plain bigint PK (ids come from public; no wiki sequence).
    // Allocate the next id with a row lock to avoid races. brand_name_normalized is
    // NOT NULL in the mirror -> derive a lowercased/trimmed normalized form.
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO brand_nodes (id, brand_name, brand_name_normalized,
                                instagram_handle, primary_style_node_id, updated_at)
       VALUES (
         (SELECT COALESCE(MAX(id), 0) + 1 FROM brand_nodes),
         $1, lower(trim($1)), $2, $3::bigint, now()
       )
       RETURNING id::text AS id`,
      [name, instagramHandle ?? null, nodeId]
    );
    const newId = inserted.rows[0].id;

    const kws = keywords ?? [];
    if (kws.length > 0) {
      await client.query(
        `INSERT INTO brand_keywords (brand_id, keyword)
         SELECT $1::bigint, kw FROM unnest($2::text[]) AS kw`,
        [newId, kws]
      );
    }
    await client.query("COMMIT");
    return await getBrandWithNodeKeywords(newId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function updateBrand(
  id: string,
  {
    name,
    instagramHandle,
    nodeId,
    keywords,
  }: {
    name?: string;
    instagramHandle?: string | null;
    nodeId?: string | null;
    keywords?: string[];
  }
): Promise<BrandWithNodeKeywords> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Replace keywords atomically (only when provided).
    if (keywords !== undefined) {
      await client.query(`DELETE FROM brand_keywords WHERE brand_id = $1`, [id]);
      if (keywords.length > 0) {
        await client.query(
          `INSERT INTO brand_keywords (brand_id, keyword)
           SELECT $1::bigint, kw FROM unnest($2::text[]) AS kw`,
          [id, keywords]
        );
      }
    }

    // Build conditional SET clause.
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (name) {
      sets.push(`brand_name = $${i++}`);
      vals.push(name);
      sets.push(`brand_name_normalized = lower(trim($${i++}))`);
      vals.push(name);
    }
    if (instagramHandle !== undefined) {
      sets.push(`instagram_handle = $${i++}`);
      vals.push(instagramHandle);
    }
    if (nodeId !== undefined) {
      sets.push(`primary_style_node_id = $${i++}::bigint`);
      vals.push(nodeId);
    }
    // Always bump updated_at on update.
    sets.push(`updated_at = now()`);

    vals.push(id);
    await client.query(
      `UPDATE brand_nodes SET ${sets.join(", ")} WHERE id = $${i}`,
      vals
    );

    await client.query("COMMIT");
    return await getBrandWithNodeKeywords(id);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function deleteBrand(id: string): Promise<void> {
  await pool.query(`DELETE FROM brand_nodes WHERE id = $1`, [id]);
}

export async function checkDuplicate(name: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM brand_nodes WHERE brand_name = $1 LIMIT 1`,
    [name]
  );
  return res.rows.length > 0;
}

// Used by PUT to detect a name collision against OTHER brands.
export async function checkDuplicateExcept(
  name: string,
  exceptId: string
): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM brand_nodes WHERE brand_name = $1 AND id <> $2 LIMIT 1`,
    [name, exceptId]
  );
  return res.rows.length > 0;
}

export async function findBrandNameForSlug(
  id: string
): Promise<string | null> {
  const res = await pool.query<{ name: string }>(
    `SELECT brand_name AS name FROM brand_nodes WHERE id = $1`,
    [id]
  );
  return res.rows[0]?.name ?? null;
}

export async function updateBrandInstagram(
  id: string,
  {
    instagramHandle,
    instagramUrl,
    thumbnailUrl,
    feedThumbnails,
  }: {
    instagramHandle: string;
    instagramUrl: string;
    thumbnailUrl: string | null;
    feedThumbnails: string[];
  }
): Promise<BrandWithNodeKeywords> {
  await pool.query(
    `UPDATE brand_nodes
     SET instagram_handle = $1,
         instagram_url    = $2,
         thumbnail_url    = $3,
         feed_thumbnails  = $4,
         updated_at       = now()
     WHERE id = $5`,
    [instagramHandle, instagramUrl, thumbnailUrl, feedThumbnails, id]
  );
  return await getBrandWithNodeKeywords(id);
}

// Re-export brand types for callers that only need the flat shapes.
export type { BrandNode, BrandWithNode };
