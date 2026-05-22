import type {
  StyleNode,
  BrandWithNode,
  BrandRelation,
  StyleNodeAdjacency,
} from "@/lib/types";

export interface GraphNode {
  id: string;
  type: "cluster" | "brand";
  name: string;
  color?: string;
  thumbnailUrl?: string;
  nodeId?: string;
  val: number;
  // 클러스터 내부의 미시 좌표 (-1 ~ +1). null이면 자유 배치.
  axisX?: number | null;
  axisY?: number | null;
}

export interface GraphLink {
  source: string;
  target: string;
  strength: number;
  type: "cluster-member" | "brand-relation" | "node-relation";
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// Builds the GraphData wire shape consumed unchanged by GraphCanvas:
//   - style cluster -> {type:'cluster', name=name_ko, color, val:20}
//   - brand        -> {type:'brand', name=brand_name, color=parent cluster color,
//                       nodeId=primary_style_node_id (string), axisX/Y from x/y_position, val:8}
//   - cluster-member links from each brand's nodeId
//   - brand-relation links from brand_relations
//   - node-relation links from style_node_adjacency
export function buildGraphData(
  clusterNodes: StyleNode[],
  brands: BrandWithNode[],
  brandRelations: BrandRelation[],
  nodeRelations: StyleNodeAdjacency[]
): GraphData {
  const nodes: GraphNode[] = [
    ...clusterNodes.map((n) => ({
      id: n.id,
      type: "cluster" as const,
      name: n.name,
      color: n.color ?? "#888888",
      val: 20,
    })),
    ...brands.map((b) => ({
      id: b.id,
      type: "brand" as const,
      name: b.name,
      color: b.node?.color ?? "#888888",
      thumbnailUrl: b.thumbnailUrl ?? undefined,
      nodeId: b.nodeId ?? undefined,
      axisX: b.xPosition,
      axisY: b.yPosition,
      val: 8,
    })),
  ];

  const links: GraphLink[] = [
    // cluster → brand membership edges
    ...brands
      .filter((b) => b.nodeId)
      .map((b) => ({
        source: b.nodeId!,
        target: b.id,
        strength: 1.0,
        type: "cluster-member" as const,
      })),
    // brand ↔ brand relations
    ...brandRelations.map((r) => ({
      source: r.brandIdA,
      target: r.brandIdB,
      strength: Number(r.strength),
      type: "brand-relation" as const,
    })),
    // cluster ↔ cluster relations (style_node_adjacency; weight is numeric → coerce)
    ...nodeRelations.map((r) => ({
      source: r.fromId,
      target: r.toId,
      strength: Number(r.weight),
      type: "node-relation" as const,
    })),
  ];

  return { nodes, links };
}
