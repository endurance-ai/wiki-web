import "server-only";
import { pool } from "@/lib/db";
import type { BrandNode } from "@/lib/types";

export async function listNodes(): Promise<BrandNode[]> {
  const res = await pool.query<BrandNode>(`
    SELECT id,
           name,
           description,
           color,
           created_at   AS "createdAt",
           axis_x_label AS "axisXLabel",
           axis_y_label AS "axisYLabel"
    FROM brand_nodes
    ORDER BY created_at ASC
  `);
  return res.rows;
}
