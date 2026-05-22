import "server-only";
import { pool } from "@/lib/db";
import type {
  Brand,
  BrandWithNode,
  BrandWithNodeKeywords,
  BrandWithDetail,
} from "@/lib/types";

// Base brand columns (camelCase aliased). Prefix `b.` so it composes inside JOINs.
const BRAND_COLS = `
  b.id,
  b.name,
  b.instagram_handle AS "instagramHandle",
  b.thumbnail_url    AS "thumbnailUrl",
  b.node_id          AS "nodeId",
  b.x_position       AS "xPosition",
  b.y_position       AS "yPosition",
  b.created_at       AS "createdAt",
  b.updated_at       AS "updatedAt",
  b.instagram_url    AS "instagramUrl",
  b.feed_thumbnails  AS "feedThumbnails"
`;

// Joined node object (NULL when brand has no node), matching Prisma `node` include.
const NODE_JSON = `
  CASE WHEN n.id IS NULL THEN NULL ELSE json_build_object(
    'id', n.id,
    'name', n.name,
    'description', n.description,
    'color', n.color,
    'createdAt', n.created_at,
    'axisXLabel', n.axis_x_label,
    'axisYLabel', n.axis_y_label
  ) END AS "node"
`;

// Aggregated keywords array (empty array when none), matching Prisma `keywords` include.
const KEYWORDS_JSON = `
  COALESCE(
    (SELECT json_agg(json_build_object('id', k.id, 'brandId', k.brand_id, 'keyword', k.keyword))
     FROM brand_keywords k WHERE k.brand_id = b.id),
    '[]'::json
  ) AS "keywords"
`;

export async function listBrands(): Promise<BrandWithNodeKeywords[]> {
  const res = await pool.query(
    `SELECT ${BRAND_COLS}, ${NODE_JSON}, ${KEYWORDS_JSON}
     FROM brands b
     LEFT JOIN brand_nodes n ON n.id = b.node_id
     ORDER BY b.created_at ASC`
  );
  return res.rows as BrandWithNodeKeywords[];
}

export async function getBrandById(id: string): Promise<BrandWithDetail | null> {
  const res = await pool.query(
    `SELECT ${BRAND_COLS}, ${NODE_JSON}, ${KEYWORDS_JSON},
            COALESCE(
              (SELECT json_agg(json_build_object(
                 'id', c.id,
                 'brandId', c.brand_id,
                 'authorId', c.author_id,
                 'authorName', c.author_name,
                 'content', c.content,
                 'createdAt', c.created_at
               ) ORDER BY c.created_at DESC)
               FROM brand_comments c WHERE c.brand_id = b.id),
              '[]'::json
            ) AS "comments"
     FROM brands b
     LEFT JOIN brand_nodes n ON n.id = b.node_id
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
     FROM brands b
     LEFT JOIN brand_nodes n ON n.id = b.node_id
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
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO brands (name, instagram_handle, node_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [name, instagramHandle ?? null, nodeId]
    );
    const newId = inserted.rows[0].id;

    const kws = keywords ?? [];
    if (kws.length > 0) {
      await client.query(
        `INSERT INTO brand_keywords (brand_id, keyword)
         SELECT $1, kw FROM unnest($2::text[]) AS kw`,
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
           SELECT $1, kw FROM unnest($2::text[]) AS kw`,
          [id, keywords]
        );
      }
    }

    // Build conditional SET clause matching Prisma's spread-conditional update.
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (name) {
      sets.push(`name = $${i++}`);
      vals.push(name);
    }
    if (instagramHandle !== undefined) {
      sets.push(`instagram_handle = $${i++}`);
      vals.push(instagramHandle);
    }
    if (nodeId !== undefined) {
      sets.push(`node_id = $${i++}`);
      vals.push(nodeId);
    }
    // Prisma @updatedAt: always bump updated_at on update.
    sets.push(`updated_at = now()`);

    vals.push(id);
    await client.query(
      `UPDATE brands SET ${sets.join(", ")} WHERE id = $${i}`,
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
  await pool.query(`DELETE FROM brands WHERE id = $1`, [id]);
}

export async function checkDuplicate(name: string): Promise<boolean> {
  const res = await pool.query(`SELECT 1 FROM brands WHERE name = $1 LIMIT 1`, [
    name,
  ]);
  return res.rows.length > 0;
}

// Used by PUT to detect a name collision against OTHER brands.
export async function checkDuplicateExcept(
  name: string,
  exceptId: string
): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM brands WHERE name = $1 AND id <> $2 LIMIT 1`,
    [name, exceptId]
  );
  return res.rows.length > 0;
}

export async function findBrandNameForSlug(
  id: string
): Promise<string | null> {
  const res = await pool.query<{ name: string }>(
    `SELECT name FROM brands WHERE id = $1`,
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
    `UPDATE brands
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

// Re-export Brand for callers that only need the flat shape.
export type { Brand, BrandWithNode };
