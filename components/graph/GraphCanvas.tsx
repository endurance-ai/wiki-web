"use client";

import { useEffect, useRef, useState } from "react";
import { useUIStore } from "@/lib/store";
import { clusterLabel } from "@/lib/cluster-labels";

interface FGNode {
  id: string;
  type: "cluster" | "brand";
  name: string;
  color?: string;
  thumbnailUrl?: string;
  nodeId?: string;
  axisX?: number | null;
  axisY?: number | null;
  val: number;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  [key: string]: unknown;
}

// 클러스터 중심에서 브랜드 카드까지 거리 스케일.
// axis 값이 -1~+1 → 실제 픽셀 거리 [MIN, MAX] 사이로 늘어남.
// 좌표값이 작아도 클러스터 가까이 붙고, 큰 값은 멀리 퍼져서 거리감이 생긴다.
const CLUSTER_RADIUS_MIN = 80;
const CLUSTER_RADIUS_MAX = 320;

interface FGLink {
  source: string | FGNode;
  target: string | FGNode;
  type: string;
  strength: number;
  [key: string]: unknown;
}

const imgCache = new Map<string, HTMLImageElement | "loading" | "error">();

function loadImage(url: string): HTMLImageElement | null {
  const cached = imgCache.get(url);
  if (cached === "loading" || cached === "error") return null;
  if (cached) return cached;
  imgCache.set(url, "loading");
  const img = new Image();
  // 로컬 경로(/feed-images/...)는 그대로, 외부 URL만 프록시 경유
  img.src = url.startsWith("/") ? url : `/api/proxy-image?url=${encodeURIComponent(url)}`;
  img.onload = () => imgCache.set(url, img);
  img.onerror = () => imgCache.set(url, "error");
  return null;
}

export default function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ForceGraph, setForceGraph] = useState<any>(null);
  const [graphData, setGraphData] = useState<{ nodes: FGNode[]; links: FGLink[] } | null>(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const selectedClusterId = useUIStore((s) => s.selectedClusterId);

  useEffect(() => {
    import("react-force-graph-2d").then((mod) => setForceGraph(() => mod.default));
  }, []);

  useEffect(() => {
    fetch("/api/graph").then((r) => r.json()).then(setGraphData);
  }, []);

  // 2단계 시뮬레이션:
  //   Phase 1 (0 ~ SETTLE_MS): 원본 d3 forces (axisForce + charge -180 + 링크 + center)
  //     → 클러스터/브랜드가 자연스러운 settling 위치로 자리잡음.
  //   Phase 2 (SETTLE_MS 이후): 클러스터 fx/fy lock, 그 시점의 브랜드 상대 위치를 base로 캡처,
  //     base를 클러스터 중심으로 시계방향 회전시키는 positionForce로 전환.
  //     → 맨 처음 배치는 그대로, 그 위에 회전만 얹어짐.
  useEffect(() => {
    if (!fgRef.current || !graphData) return;

    const fg = fgRef.current;
    const nodeById = new Map<string, FGNode>(graphData.nodes.map(n => [n.id, n]));
    const SETTLE_MS = 9000;

    // === Phase 1: 원본 force 셋업 ===
    // axisForce를 강하게 (k=0.6) — cross-cluster brand-relation의 끌어당김을 이기고
    // 각 브랜드가 자기 클러스터 중심 주변에 응집하도록.
    const axisForce = (alpha: number) => {
      for (const node of graphData.nodes) {
        if (node.type !== "brand") continue;
        if (node.axisX == null || node.axisY == null) continue;
        if (!node.nodeId) continue;
        const cluster = nodeById.get(node.nodeId);
        if (!cluster) continue;
        const cx = cluster.x, cy = cluster.y;
        if (typeof cx !== "number" || typeof cy !== "number") continue;
        const mag = Math.hypot(node.axisX, node.axisY);
        const r = CLUSTER_RADIUS_MIN + (CLUSTER_RADIUS_MAX - CLUSTER_RADIUS_MIN) * (mag / Math.SQRT2);
        const angle = Math.atan2(-node.axisY, node.axisX);
        const targetX = cx + Math.cos(angle) * r;
        const targetY = cy + Math.sin(angle) * r;
        const k = alpha * 0.6;
        const nx = typeof node.x === "number" ? node.x : 0;
        const ny = typeof node.y === "number" ? node.y : 0;
        node.vx = (node.vx ?? 0) + (targetX - nx) * k;
        node.vy = (node.vy ?? 0) + (targetY - ny) * k;
      }
    };

    // 클러스터끼리만 강하게 밀어내는 커스텀 force.
    // 노드 간 거리가 가까울수록 inverse-square로 척력 적용.
    const clusterRepulsion = () => {
      const clusters = graphData.nodes.filter(n => n.type === "cluster");
      const MIN_DIST = 600;        // 이 거리 내에 있으면 밀어냄
      const STRENGTH = 80000;      // 척력 강도
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const a = clusters[i], b = clusters[j];
          const ax = a.x ?? 0, ay = a.y ?? 0;
          const bx = b.x ?? 0, by = b.y ?? 0;
          const dx = bx - ax, dy = by - ay;
          const dist = Math.hypot(dx, dy);
          if (dist <= 0 || dist > MIN_DIST) continue;
          const force = STRENGTH / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx = (a.vx ?? 0) - fx;
          a.vy = (a.vy ?? 0) - fy;
          b.vx = (b.vx ?? 0) + fx;
          b.vy = (b.vy ?? 0) + fy;
        }
      }
    };

    fg.d3Force("axis", axisForce);
    fg.d3Force("clusterRepulse", clusterRepulsion);
    fg.d3Force("position", null);
    fg.d3Force("radial", null);
    fg.d3Force("orbit", null);
    fg.d3Force("wander", null);
    const charge = fg.d3Force("charge");
    // 클러스터는 매우 강하게 밀어내고, 브랜드는 약하게.
    if (charge) charge.strength((n: FGNode) => n.type === "cluster" ? -2500 : -120);
    const link = fg.d3Force("link");
    if (link) {
      // cluster-member: 클러스터 ↔ 자기 브랜드 (약하게, axisForce가 주도)
      // brand-relation: 브랜드 ↔ 브랜드 (cross-cluster일 때 섞이는 원인 → 매우 약하게)
      // node-relation : 클러스터 ↔ 클러스터 (의미적 유사도 — 끌어당김보다 충분히 약하게)
      link.distance((l: FGLink) =>
        l.type === "cluster-member" ? 60 :
        l.type === "brand-relation" ? 120 :
        500
      );
      link.strength((l: FGLink) =>
        l.type === "cluster-member" ? 0.05 :
        l.type === "brand-relation" ? 0.03 :
        0.03
      );
    }
    fg.d3ReheatSimulation();

    // === Phase 2: SETTLE_MS 이후 lock + 회전 모드 전환 ===
    const switchPhase = setTimeout(() => {
      const clusterRotation = new Map<string, number>();
      const brandBase = new Map<string, { bx: number; by: number; clusterId: string }>();

      // 클러스터 위치 캡처 & lock
      for (const node of graphData.nodes) {
        if (node.type !== "cluster") continue;
        if (typeof node.x === "number") node.fx = node.x;
        if (typeof node.y === "number") node.fy = node.y;
        clusterRotation.set(node.id, 0);
      }

      // 브랜드의 (클러스터 중심에 대한) 상대 위치 캡처 → 회전의 base
      for (const node of graphData.nodes) {
        if (node.type !== "brand") continue;
        if (!node.nodeId) continue;
        const cluster = nodeById.get(node.nodeId);
        if (!cluster) continue;
        const cx = cluster.x, cy = cluster.y;
        if (typeof cx !== "number" || typeof cy !== "number") continue;
        const nx = typeof node.x === "number" ? node.x : 0;
        const ny = typeof node.y === "number" ? node.y : 0;
        brandBase.set(node.id, { bx: nx - cx, by: ny - cy, clusterId: node.nodeId });
      }

      const OMEGA = 0.0012; // rad/tick → 1회전 ≈ 90초
      const positionForce = () => {
        // 모든 클러스터 θ 갱신
        for (const [id, θ] of clusterRotation) {
          clusterRotation.set(id, θ + OMEGA);
        }
        for (const node of graphData.nodes) {
          if (node.type !== "brand") continue;
          const base = brandBase.get(node.id);
          if (!base) continue;
          const cluster = nodeById.get(base.clusterId);
          if (!cluster) continue;
          const cx = cluster.x, cy = cluster.y;
          if (typeof cx !== "number" || typeof cy !== "number") continue;
          const θ = clusterRotation.get(base.clusterId) ?? 0;
          // 시계방향 회전 (screen y-down): (x', y') = (x cosθ - y sinθ, x sinθ + y cosθ)
          const c = Math.cos(θ), s = Math.sin(θ);
          const targetX = cx + base.bx * c - base.by * s;
          const targetY = cy + base.bx * s + base.by * c;
          const k = 0.12;
          const nx = typeof node.x === "number" ? node.x : 0;
          const ny = typeof node.y === "number" ? node.y : 0;
          node.vx = (node.vx ?? 0) + (targetX - nx) * k;
          node.vy = (node.vy ?? 0) + (targetY - ny) * k;
        }
      };

      fg.d3Force("axis", null);
      fg.d3Force("clusterRepulse", null);
      fg.d3Force("position", positionForce);
      // 회전 모드: positionForce가 brand 위치를 결정 → 링크 영향 거의 끔
      // cluster-member/brand-relation은 0, node-relation만 약하게 (클러스터 위치는 lock이라 영향 없음)
      const link2 = fg.d3Force("link");
      if (link2) {
        link2.strength((l: FGLink) =>
          l.type === "node-relation" ? 0.05 : 0
        );
      }
      fg.d3Force("center", null);
      const charge2 = fg.d3Force("charge");
      if (charge2) charge2.strength(-25);

      // alphaTarget 양수로 두면 sim이 그 위에서 영원히 ticking → canvas 안 멈춤.
      if (typeof fg.d3AlphaTarget === "function") fg.d3AlphaTarget(0.3);
      fg.d3ReheatSimulation();
    }, SETTLE_MS);

    return () => clearTimeout(switchPhase);
  }, [graphData]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setDims({ width: el.clientWidth, height: el.clientHeight });
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // selectedClusterId 변경 시 해당 클러스터로 부드럽게 줌/이동.
  // null이면 전체 zoomToFit 복귀.
  // cooldownTicks=Infinity 라서 onEngineStop가 안 뜨므로, 초기 fit은 setTimeout으로 처리.
  useEffect(() => {
    if (!fgRef.current || !graphData) return;
    const fg = fgRef.current;
    if (!selectedClusterId) {
      const t = setTimeout(() => fg.zoomToFit(600, 80), 9300);
      return () => clearTimeout(t);
    }
    const target = graphData.nodes.find((n) => n.id === selectedClusterId);
    if (!target || typeof target.x !== "number" || typeof target.y !== "number") return;
    fg.centerAt(target.x, target.y, 700);
    fg.zoom(1.0, 700);
  }, [selectedClusterId, graphData]);

  if (!ForceGraph || !graphData || dims.width === 0) {
    return (
      <div ref={containerRef} className="absolute inset-0" style={{ background: "#F0F0F2" }}>
        <span style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
          fontSize: "0.7rem", letterSpacing: "0.2em", color: "#0D0D0D",
          textTransform: "uppercase", opacity: 0.35,
        }}>Loading</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="absolute inset-0">
      <ForceGraph
        ref={fgRef}
        width={dims.width}
        height={dims.height}
        graphData={graphData}
        backgroundColor="#F0F0F2"
        nodeLabel=""
        nodeVal={(n: FGNode) => n.type === "cluster" ? 20 : 4}
        nodeColor={(n: FGNode) => n.color ?? "#aaaaaa"}
        nodeCanvasObject={(node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const x = node.x ?? 0;
          const y = node.y ?? 0;

          if (node.type === "cluster") {
            const r = 22;
            const color = node.color ?? "#888";
            const isActive = !selectedClusterId || node.id === selectedClusterId;
            const alpha = isActive ? "" : "44";
            const haloAlpha = isActive ? "18" : "08";
            // halo
            ctx.beginPath();
            ctx.arc(x, y, r + 16, 0, 2 * Math.PI);
            ctx.fillStyle = color + haloAlpha;
            ctx.fill();
            // circle
            ctx.beginPath();
            ctx.arc(x, y, r, 0, 2 * Math.PI);
            ctx.fillStyle = isActive ? color + "EE" : color + "55";
            ctx.fill();
            ctx.strokeStyle = node.id === selectedClusterId ? "#0D0D0D" : color + (alpha || "");
            ctx.lineWidth = node.id === selectedClusterId ? 2.2 / globalScale : 1.5 / globalScale;
            ctx.stroke();
            // label
            const label = clusterLabel(node.name);
            const short = label.length > 12 ? label.slice(0, 12) + "…" : label;
            const fs = Math.max(10 / globalScale, 6);
            ctx.font = `600 ${fs}px "Helvetica Neue", Helvetica, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#fff";
            ctx.fillText(short, x, y);

          } else {
            // Brand node — square card
            const isHovered = node.id === hoveredId;
            const color = node.color ?? "#cccccc";
            const isActive = !selectedClusterId || node.nodeId === selectedClusterId;

            // Card size scales with zoom: bigger when zoomed in
            const baseSize = 30;
            const half = baseSize / 2;

            const img = node.thumbnailUrl ? loadImage(node.thumbnailUrl) : null;

            ctx.save();
            ctx.globalAlpha = isActive ? 1 : 0.22;

            if (img) {
              // Photo card
              ctx.save();
              ctx.beginPath();
              ctx.rect(x - half, y - half, baseSize, baseSize);
              ctx.clip();
              ctx.drawImage(img, x - half, y - half, baseSize, baseSize);
              ctx.restore();
              // border
              ctx.strokeStyle = isHovered ? "#0D0D0D" : color + "AA";
              ctx.lineWidth = isHovered ? 1.5 / globalScale : 0.8 / globalScale;
              ctx.strokeRect(x - half, y - half, baseSize, baseSize);
            } else {
              // Placeholder card
              ctx.fillStyle = isHovered ? color + "FF" : color + "33";
              ctx.fillRect(x - half, y - half, baseSize, baseSize);
              ctx.strokeStyle = isHovered ? color : color + "88";
              ctx.lineWidth = isHovered ? 1.2 / globalScale : 0.6 / globalScale;
              ctx.strokeRect(x - half, y - half, baseSize, baseSize);

              // Brand initial letter in placeholder
              const initial = node.name.charAt(0).toUpperCase();
              const fs = Math.max(8 / globalScale, 4);
              ctx.font = `500 ${fs}px "Helvetica Neue", Helvetica, sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillStyle = isHovered ? color : color + "CC";
              ctx.fillText(initial, x, y);
            }

            // Brand name label — always show when zoomed in, or on hover
            if (isHovered || globalScale > 3) {
              const fs = Math.max(6 / globalScale, 4.5);
              ctx.font = `${fs}px "Helvetica Neue", Helvetica, sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = "#0D0D0D";
              ctx.fillText(node.name, x, y + half + 2 / globalScale);
            }
            ctx.restore();
          }
        }}
        nodeCanvasObjectMode={() => "replace"}
        linkColor={(l: FGLink) =>
          l.type === "node-relation" ? "#0D0D0D55" :
          l.type === "cluster-member" ? "#0D0D0D3A" : "#0D0D0D22"
        }
        linkWidth={(l: FGLink) =>
          l.type === "node-relation" ? 1.2 :
          l.type === "cluster-member" ? 0.6 : 0.4
        }
        onNodeHover={(n: unknown) => setHoveredId(n ? (n as FGNode).id : null)}
        onNodeClick={(n: unknown) => {
          const node = n as FGNode;
          if (node?.type === "brand") useUIStore.getState().setFocusedBrandId(node.id);
          else if (node?.type === "cluster") useUIStore.getState().setSelectedClusterId(node.id);
        }}
        onEngineStop={() => {
          if (!useUIStore.getState().selectedClusterId) fgRef.current?.zoomToFit(600, 80);
        }}
        d3VelocityDecay={0.35}
        d3AlphaDecay={0.015}
        d3AlphaMin={0}
        cooldownTicks={Infinity}
        cooldownTime={Infinity}
        warmupTicks={30}
        minZoom={0.05}
        maxZoom={12}
      />
    </div>
  );
}
