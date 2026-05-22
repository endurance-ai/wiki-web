import "server-only";
import { pool } from "@/lib/db";
import type { StyleNode } from "@/lib/types";

// Lists style clusters (wiki.style_nodes). `name` is aliased from name_ko so
// clusterLabel() keeps working; `description` is mapped from mood for the legacy
// ClusterNode shape the panel reads. id cast to text (bigint -> string).
export async function listNodes(): Promise<StyleNode[]> {
  const res = await pool.query<StyleNode>(`
    SELECT id::text     AS id,
           code,
           name_ko      AS name,
           name_en      AS "nameEn",
           color,
           mood,
           mood         AS description,
           is_active    AS "isActive",
           created_at   AS "createdAt",
           updated_at   AS "updatedAt"
    FROM style_nodes
    ORDER BY id ASC
  `);
  return res.rows;
}
