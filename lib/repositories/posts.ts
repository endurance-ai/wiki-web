import "server-only";
import { pool } from "@/lib/db";
import type { BrandInstagramPost } from "@/lib/types";

// camelCase aliased columns, matching the rest of the repositories.
const POST_COLS = `
  p.id::text         AS id,
  p.brand_id::text   AS "brandId",
  p.shortcode        AS shortcode,
  p.post_url         AS "postUrl",
  p.type             AS type,
  p.caption          AS caption,
  p.image_urls       AS "imageUrls",
  p.likes_count      AS "likesCount",
  p.comments_count   AS "commentsCount",
  p.taken_at         AS "takenAt",
  p.position         AS position
`;

export interface ScrapedPostInput {
  shortcode: string;
  postUrl: string | null;
  type: string | null;
  caption: string | null;
  imageUrls: string[];
  likesCount: number | null;
  commentsCount: number | null;
  takenAt: string | null;
  position: number;
}

/** Latest posts for a brand, recency order (position asc). */
export async function getBrandPosts(
  brandId: string
): Promise<BrandInstagramPost[]> {
  const res = await pool.query(
    `SELECT ${POST_COLS}
     FROM brand_instagram_posts p
     WHERE p.brand_id = $1
     ORDER BY p.position ASC`,
    [brandId]
  );
  return res.rows as BrandInstagramPost[];
}

/**
 * Replace a brand's feed with a fresh scrape snapshot (delete-then-insert in one
 * transaction). Posts that dropped off the latest page are removed, so the table
 * always reflects the current feed. No-op insert when `posts` is empty.
 */
export async function replaceBrandPosts(
  brandId: string,
  posts: ScrapedPostInput[]
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM brand_instagram_posts WHERE brand_id = $1`, [
      brandId,
    ]);

    for (const p of posts) {
      await client.query(
        `INSERT INTO brand_instagram_posts
           (brand_id, shortcode, post_url, type, caption, image_urls,
            likes_count, comments_count, taken_at, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          brandId,
          p.shortcode,
          p.postUrl,
          p.type,
          p.caption,
          p.imageUrls,
          p.likesCount,
          p.commentsCount,
          p.takenAt,
          p.position,
        ]
      );
    }

    await client.query("COMMIT");
    return posts.length;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
