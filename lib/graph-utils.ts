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
  // x/y_position are GLOBAL UMAP coords, but GraphCanvas's axisForce expects
  // per-cluster micro-coords in [-1,+1]. Normalize each cluster's members
  // (min-max per axis) so brands form a tidy radial spread around their style
  // node. Brands without UMAP coords get a deterministic ring position so they
  // still orbit their cluster instead of floating.
  const byCluster = new Map<string, BrandWithNode[]>();
  for (const b of brands) {
    if (!b.nodeId) continue;
    const arr = byCluster.get(b.nodeId);
    if (arr) arr.push(b);
    else byCluster.set(b.nodeId, [b]);
  }
  const axisByBrand = new Map<string, { x: number; y: number }>();
  for (const members of byCluster.values()) {
    const pts = members.filter(
      (m) => typeof m.xPosition === "number" && typeof m.yPosition === "number"
    );
    const xs = pts.map((m) => m.xPosition as number);
    const ys = pts.map((m) => m.yPosition as number);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
    members.forEach((m, i) => {
      if (typeof m.xPosition === "number" && typeof m.yPosition === "number") {
        axisByBrand.set(m.id, {
          x: (2 * (m.xPosition - minX)) / rangeX - 1,
          y: (2 * (m.yPosition - minY)) / rangeY - 1,
        });
      } else {
        const ang = (2 * Math.PI * i) / Math.max(members.length, 1);
        axisByBrand.set(m.id, { x: Math.cos(ang) * 0.6, y: Math.sin(ang) * 0.6 });
      }
    });
  }

  const nodes: GraphNode[] = [
    ...clusterNodes.map((n) => ({
      id: n.id,
      type: "cluster" as const,
      name: n.name,
      color: n.color ?? "#888888",
      val: 20,
    })),
    // 브랜드 노드 id 에 "b" 접두사 → style_nodes 와 brand_nodes 의 bigint id 충돌 방지.
    // (둘 다 1,2,3.. 으로 시작 → 접두사 없이는 cluster-member 링크의 source="1"(primary_
    //  style_node_id)이 브랜드 id=1 로 잘못 연결됨.)
    ...brands.map((b) => ({
      id: "b" + b.id,
      type: "brand" as const,
      name: b.name,
      color: b.node?.color ?? "#888888",
      thumbnailUrl: b.thumbnailUrl ?? undefined,
      nodeId: b.nodeId ?? undefined,
      axisX: b.nodeId ? (axisByBrand.get(b.id)?.x ?? null) : null,
      axisY: b.nodeId ? (axisByBrand.get(b.id)?.y ?? null) : null,
      val: 8,
    })),
  ];

  const links: GraphLink[] = [
    // cluster → brand membership edges
    ...brands
      .filter((b) => b.nodeId)
      .map((b) => ({
        source: b.nodeId!,
        target: "b" + b.id,
        strength: 1.0,
        type: "cluster-member" as const,
      })),
    // brand ↔ brand relations
    ...brandRelations.map((r) => ({
      source: "b" + r.brandIdA,
      target: "b" + r.brandIdB,
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
