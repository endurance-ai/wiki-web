import "server-only";
import { pool } from "@/lib/db";
import type {
  StyleNode,
  BrandWithNode,
  BrandRelation,
  StyleNodeAdjacency,
} from "@/lib/types";

export interface GraphInputs {
  clusterNodes: StyleNode[];
  brands: BrandWithNode[];
  brandRelations: BrandRelation[];
  nodeRelations: StyleNodeAdjacency[];
}

// @MX:ANCHOR: [AUTO] feeds buildGraphData in /api/graph; shape must stay stable
// @MX:REASON: the graph route passes these four arrays straight into buildGraphData
//   which produces the GraphData wire shape GraphCanvas renders. Any column/alias
//   drift (bigint not cast to text, brand_name not aliased to name, etc.) silently
//   corrupts force-graph rendering. ids are cast ::text because the graph uses
//   string ids throughout.
export async function getGraphData(): Promise<GraphInputs> {
  const [clusterRes, brandRes, brandRelRes, nodeRelRes] = await Promise.all([
    pool.query<StyleNode>(`
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
    `),
    pool.query(`
      SELECT b.id::text                    AS id,
             b.brand_name                  AS name,
             b.instagram_handle            AS "instagramHandle",
             b.instagram_url               AS "instagramUrl",
             b.thumbnail_url               AS "thumbnailUrl",
             b.primary_style_node_id::text AS "nodeId",
             b.x_position                  AS "xPosition",
             b.y_position                  AS "yPosition",
             b.updated_at                  AS "createdAt",
             b.updated_at                  AS "updatedAt",
             b.feed_thumbnails             AS "feedThumbnails",
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
      FROM brand_nodes b
      LEFT JOIN style_nodes n ON n.id = b.primary_style_node_id
    `),
    pool.query<BrandRelation>(`
      SELECT id::text         AS id,
             brand_id_a::text AS "brandIdA",
             brand_id_b::text AS "brandIdB",
             strength,
             relation_type    AS "relationType"
      FROM brand_relations
    `),
    pool.query<StyleNodeAdjacency>(`
      SELECT from_id::text AS "fromId",
             to_id::text   AS "toId",
             weight,
             source
      FROM style_node_adjacency
    `),
  ]);

  return {
    clusterNodes: clusterRes.rows,
    brands: brandRes.rows as BrandWithNode[],
    brandRelations: brandRelRes.rows,
    nodeRelations: nodeRelRes.rows,
  };
}
