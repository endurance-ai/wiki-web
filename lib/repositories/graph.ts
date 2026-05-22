import "server-only";
import { pool } from "@/lib/db";
import type {
  BrandNode,
  BrandWithNode,
  BrandRelation,
  NodeRelation,
} from "@/lib/types";

export interface GraphInputs {
  clusterNodes: BrandNode[];
  brands: BrandWithNode[];
  brandRelations: BrandRelation[];
  nodeRelations: NodeRelation[];
}

// @MX:ANCHOR: [AUTO] feeds buildGraphData in /api/graph; shape must match Prisma findMany output
// @MX:REASON: the graph route passes these four arrays straight into buildGraphData;
//   any column/alias drift silently corrupts the force-graph rendering.
export async function getGraphData(): Promise<GraphInputs> {
  const [clusterRes, brandRes, brandRelRes, nodeRelRes] = await Promise.all([
    pool.query<BrandNode>(`
      SELECT id,
             name,
             description,
             color,
             created_at   AS "createdAt",
             axis_x_label AS "axisXLabel",
             axis_y_label AS "axisYLabel"
      FROM brand_nodes
    `),
    pool.query(`
      SELECT b.id,
             b.name,
             b.instagram_handle AS "instagramHandle",
             b.thumbnail_url    AS "thumbnailUrl",
             b.node_id          AS "nodeId",
             b.x_position       AS "xPosition",
             b.y_position       AS "yPosition",
             b.created_at       AS "createdAt",
             b.updated_at       AS "updatedAt",
             b.instagram_url    AS "instagramUrl",
             b.feed_thumbnails  AS "feedThumbnails",
             CASE WHEN n.id IS NULL THEN NULL ELSE json_build_object(
               'id', n.id,
               'name', n.name,
               'description', n.description,
               'color', n.color,
               'createdAt', n.created_at,
               'axisXLabel', n.axis_x_label,
               'axisYLabel', n.axis_y_label
             ) END AS "node"
      FROM brands b
      LEFT JOIN brand_nodes n ON n.id = b.node_id
    `),
    pool.query<BrandRelation>(`
      SELECT id,
             brand_id_a    AS "brandIdA",
             brand_id_b    AS "brandIdB",
             strength,
             relation_type AS "relationType"
      FROM brand_relations
    `),
    pool.query<NodeRelation>(`
      SELECT id,
             node_id_a AS "nodeIdA",
             node_id_b AS "nodeIdB",
             strength
      FROM node_relations
    `),
  ]);

  return {
    clusterNodes: clusterRes.rows,
    brands: brandRes.rows as BrandWithNode[],
    brandRelations: brandRelRes.rows,
    nodeRelations: nodeRelRes.rows,
  };
}
