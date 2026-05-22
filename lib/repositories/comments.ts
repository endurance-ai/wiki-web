import "server-only";
import { pool } from "@/lib/db";
import type { BrandComment } from "@/lib/types";

const COMMENT_COLS = `
  id,
  brand_id    AS "brandId",
  author_id   AS "authorId",
  author_name AS "authorName",
  content,
  created_at  AS "createdAt"
`;

export async function listComments(brandId: string): Promise<BrandComment[]> {
  const res = await pool.query<BrandComment>(
    `SELECT ${COMMENT_COLS}
     FROM brand_comments
     WHERE brand_id = $1
     ORDER BY created_at DESC`,
    [brandId]
  );
  return res.rows;
}

export async function createComment(
  brandId: string,
  { content, authorName }: { content: string; authorName?: string | null }
): Promise<BrandComment> {
  const res = await pool.query<BrandComment>(
    `INSERT INTO brand_comments (brand_id, content, author_name)
     VALUES ($1, $2, $3)
     RETURNING ${COMMENT_COLS}`,
    [brandId, content, authorName ?? null]
  );
  return res.rows[0];
}

export async function deleteComment(id: string): Promise<void> {
  await pool.query(`DELETE FROM brand_comments WHERE id = $1`, [id]);
}
