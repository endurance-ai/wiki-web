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
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
  // 결정론적 배치에서 계산한, 클러스터 중심 기준 상대 좌표(회전의 base).
  baseX?: number;
  baseY?: number;
  [key: string]: unknown;
}

// 클러스터 중심에서 브랜드 카드까지 거리 스케일.
// axis 값이 -1~+1 → 실제 픽셀 거리 [MIN, rMax] 사이로 늘어남.
// rMax 는 클러스터 멤버 수에 따라 동적으로 커진다 (아래 clusterRadiusMax 참조):
// 533개 짜리 클러스터는 큰 디스크, 11개 짜리는 작은 디스크. 밀도를 비슷하게 유지.
const CLUSTER_RADIUS_MIN = 70;

// 멤버 수 N 에 비례해 디스크 반경을 sqrt(N) 으로 스케일.
// 카드 면적이 일정하다고 보면 (디스크 면적 ∝ N) 반경 ∝ sqrt(N).
// RADIUS_PER_SQRT * sqrt(N), [MIN_R, MAX_R] 로 클램프.
const RADIUS_PER_SQRT = 26;
const RADIUS_MIN_R = 90;
const RADIUS_MAX_R = 900;
function clusterRadiusMax(memberCount: number): number {
  const r = RADIUS_PER_SQRT * Math.sqrt(Math.max(memberCount, 1));
  return Math.max(RADIUS_MIN_R, Math.min(RADIUS_MAX_R, r));
}

// 단계 1(정적 배치) 유지 시간(ms). 이후 회전 모드로 전환.
const SETTLE_MS = 5000;

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

    // 각 클러스터의 멤버 수 → 디스크 반경(rMax) 사전 계산.
    // 533개 클러스터는 큰 반경, 11개는 작은 반경 → 밀도를 비슷하게 맞춤.
    const memberCount = new Map<string, number>();
    for (const n of graphData.nodes) {
      if (n.type === "brand" && n.nodeId) {
        memberCount.set(n.nodeId, (memberCount.get(n.nodeId) ?? 0) + 1);
      }
    }
    const rMaxByCluster = new Map<string, number>();
    const clusterList = graphData.nodes.filter((n) => n.type === "cluster");
    for (const n of clusterList) {
      rMaxByCluster.set(n.id, clusterRadiusMax(memberCount.get(n.id) ?? 0));
    }

    // === 클러스터를 결정론적 링 위에 배치하고 즉시 lock ===
    // 클러스터는 20개뿐이고 크기를 미리 알 수 있으므로 물리로 흩뜨릴 필요가 없다.
    // 각 클러스터에 "슬롯 폭" = 2*rMax + 여백 을 주고, 슬롯 폭에 비례한 각도로 링에 배치.
    // → 큰 디스크(콰이엇 럭셔리 533개)는 넓은 각도, 작은 디스크는 좁은 각도를 차지해
    //   디스크끼리 겹치지 않는다. 이렇게 하면 클러스터가 고정되어, 브랜드가 "움직이는
    //   타깃"을 쫓다 떨어져 나가는 문제가 사라진다 (이전 버그의 근본 원인).
    const RING_MARGIN = 160;
    const slots = clusterList.map((c) => 2 * (rMaxByCluster.get(c.id) ?? RADIUS_MIN_R) + RING_MARGIN);
    const totalSlot = slots.reduce((a, b) => a + b, 0);
    const ringRadius = Math.max(totalSlot / (2 * Math.PI), 400);
    // 클러스터 좌표를 Map 에 먼저 계산 → 노드 객체에 쓰는 것과 별개로 단일 진실원천 확보.
    // (노드 객체의 x 를 쓰고 같은 루프에서 읽는 방식은 force-graph 의 노드 처리 타이밍과
    //  얽혀 undefined 를 읽는 경우가 있었음 — Map 으로 분리해 결정론적으로.)
    const clusterPos = new Map<string, { x: number; y: number }>();
    let acc = 0;
    clusterList.forEach((c, i) => {
      const angle = (2 * Math.PI * (acc + slots[i] / 2)) / totalSlot;
      acc += slots[i];
      clusterPos.set(c.id, { x: Math.cos(angle) * ringRadius, y: Math.sin(angle) * ringRadius });
    });

    // 미분류 브랜드를 바깥 링에 균등 배치하기 위한 인덱스 맵(결정론적).
    const unsortedAngle = new Map<string, { x: number; y: number }>();
    {
      const unsorted = graphData.nodes.filter(
        (n) => n.type === "brand" && (!n.nodeId || n.axisX == null || n.axisY == null)
      );
      unsorted.forEach((n, i) => {
        const a = (2 * Math.PI * i) / Math.max(unsorted.length, 1);
        const rr = ringRadius * (1.45 + 0.18 * ((i * 2654435761) % 1000) / 1000);
        unsortedAngle.set(n.id, { x: Math.cos(a) * rr, y: Math.sin(a) * rr });
      });
    }

    // === 정적 배치 force (1회 적용) ===
    // 핵심 교훈: 2899개 규모에서 d3 물리(charge/collide/spring)로 브랜드를 클러스터에
    // "정착"시키면, dense 클러스터(533개)에서 collide 누적이 스프링을 이겨 disk 가 통째로
    // 수천 px 이탈한다(검증으로 6000~16000px 이탈 확인). 그래서 물리 정착을 포기하고,
    // 각 노드를 결정론적 좌표에 직접 놓고 fx/fy 로 고정한다. → 드리프트 0.
    // (state 직접 변형 lint 회피를 위해, 원본과 동일하게 force 콜백 안에서 변형한다.)
    let placed = false;
    const staticPlacement = () => {
      if (placed) return;
      placed = true;
      for (const node of graphData.nodes) {
        if (node.type === "cluster") {
          const p = clusterPos.get(node.id);
          if (!p) continue;
          node.x = p.x; node.y = p.y; node.fx = p.x; node.fy = p.y;
          continue;
        }
        if (node.type !== "brand") continue;
        const cpos = node.nodeId ? clusterPos.get(node.nodeId) : undefined;
        if (cpos && node.axisX != null && node.axisY != null) {
          const rMax = rMaxByCluster.get(node.nodeId!) ?? RADIUS_MIN_R;
          const mag = Math.hypot(node.axisX, node.axisY);
          const r = CLUSTER_RADIUS_MIN + (rMax - CLUSTER_RADIUS_MIN) * (mag / Math.SQRT2);
          const a = Math.atan2(-node.axisY, node.axisX);
          const bx = Math.cos(a) * r;
          const by = Math.sin(a) * r;
          node.baseX = bx; node.baseY = by;
          node.x = cpos.x + bx; node.y = cpos.y + by;
          node.fx = node.x; node.fy = node.y;
          node.vx = 0; node.vy = 0;
        } else {
          const u = unsortedAngle.get(node.id);
          if (!u) continue;
          node.x = u.x; node.y = u.y; node.fx = u.x; node.fy = u.y;
          node.vx = 0; node.vy = 0;
        }
      }
    };

    // === Phase 1: 정적 배치 + 다른 물리 끔 ===
    // 노드가 fx/fy 로 고정되므로 어떤 force 도 위치를 바꾸지 않는다.
    fg.d3Force("axis", staticPlacement);
    fg.d3Force("clusterRepulse", null);
    fg.d3Force("position", null);
    fg.d3Force("radial", null);
    fg.d3Force("orbit", null);
    fg.d3Force("wander", null);
    fg.d3Force("center", null);
    fg.d3Force("collide", null);
    const charge = fg.d3Force("charge");
    if (charge) charge.strength(0);
    const link = fg.d3Force("link");
    if (link) link.strength(() => 0);
    fg.d3ReheatSimulation();

    // === Phase 2: SETTLE_MS 이후 lock + 회전 모드 전환 ===
    const switchPhase = setTimeout(() => {
      const clusterRotation = new Map<string, number>();
      for (const node of graphData.nodes) {
        if (node.type === "cluster") clusterRotation.set(node.id, 0);
      }

      // 브랜드 고정 해제 → positionForce 가 회전 타깃으로 부드럽게 이동시킬 수 있게.
      // 회전 base 는 배치 때 저장한 baseX/baseY (정확한 결정론적 오프셋) 를 그대로 사용.
      for (const node of graphData.nodes) {
        if (node.type !== "brand") continue;
        if (node.baseX == null || node.baseY == null) continue; // 미분류는 고정 유지
        node.fx = undefined; node.fy = undefined;
      }

      const OMEGA = 0.0012; // rad/tick → 1회전 ≈ 90초
      const positionForce = () => {
        for (const [id, θ] of clusterRotation) {
          clusterRotation.set(id, θ + OMEGA);
        }
        for (const node of graphData.nodes) {
          if (node.type !== "brand") continue;
          if (node.baseX == null || node.baseY == null || !node.nodeId) continue;
          const cpos = clusterPos.get(node.nodeId);
          if (!cpos) continue;
          const cx = cpos.x, cy = cpos.y;
          const θ = clusterRotation.get(node.nodeId) ?? 0;
          // 시계방향 회전 (screen y-down): (x', y') = (x cosθ - y sinθ, x sinθ + y cosθ)
          const c = Math.cos(θ), s = Math.sin(θ);
          const targetX = cx + node.baseX * c - node.baseY * s;
          const targetY = cy + node.baseX * s + node.baseY * c;
          const k = 0.15;
          const nx = typeof node.x === "number" ? node.x : 0;
          const ny = typeof node.y === "number" ? node.y : 0;
          node.vx = (node.vx ?? 0) + (targetX - nx) * k;
          node.vy = (node.vy ?? 0) + (targetY - ny) * k;
        }
      };

      fg.d3Force("axis", null);
      fg.d3Force("clusterRepulse", null);
      fg.d3Force("position", positionForce);
      const link2 = fg.d3Force("link");
      if (link2) link2.strength(() => 0);
      fg.d3Force("center", null);
      fg.d3Force("collide", null); // 회전 타깃이 모든 위치를 결정 → collide 불필요(안정성)
      const charge2 = fg.d3Force("charge");
      if (charge2) charge2.strength(0);

      // alphaTarget 양수로 두면 sim이 그 위에서 영원히 ticking → canvas 안 멈춤(회전 지속).
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
      // 초기 정착(SETTLE_MS) 직후 전체 fit. cooldownTicks=Infinity 라 onEngineStop 미발생.
      const t = setTimeout(() => fg.zoomToFit(600, 80), SETTLE_MS + 300);
      return () => clearTimeout(t);
    }
    const target = graphData.nodes.find((n) => n.id === selectedClusterId);
    if (!target || typeof target.x !== "number" || typeof target.y !== "number") return;

    // 클러스터 + 멤버 브랜드의 실제 bounding box 로 줌 레벨을 계산해 멤버 카드가
    // 화면에 꽉 차게 보이도록 한다. 고정 zoom(1.0) 은 큰 클러스터(533개)에선
    // 멤버가 화면 밖으로 나가 안 보이는 원인이었음.
    const cx = target.x, cy = target.y;
    let maxR = 60; // 최소 반경 (작은 클러스터도 너무 확대되지 않도록)
    for (const n of graphData.nodes) {
      if (n.type !== "brand" || n.nodeId !== selectedClusterId) continue;
      if (typeof n.x !== "number" || typeof n.y !== "number") continue;
      const d = Math.hypot(n.x - cx, n.y - cy);
      if (d > maxR) maxR = d;
    }
    // 멤버 분포가 아직 안 잡혔으면(좌표 미설정) 잠시 후 재시도되도록 fallback.
    const span = (maxR + 40) * 2; // 지름 + 카드 여백
    const fit = Math.min(dims.width / span, dims.height / span);
    const z = Math.max(0.05, Math.min(12, fit));
    fg.centerAt(cx, cy, 700);
    fg.zoom(z, 700);
  }, [selectedClusterId, graphData, dims.width, dims.height]);

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
        linkColor={(l: FGLink) => {
          // cluster-member 스포크는 2194개라 많이 쌓여 화면을 가린다 → 매우 옅게.
          // 클러스터 선택 시엔 그 클러스터의 멤버 스포크만 살짝 보이고 나머지는 거의 숨김.
          if (l.type === "node-relation") return "#0D0D0D55";
          if (l.type === "cluster-member") {
            if (!selectedClusterId) return "#0D0D0D10";
            const src = typeof l.source === "object" ? (l.source as FGNode).id : l.source;
            return src === selectedClusterId ? "#0D0D0D24" : "#0D0D0D06";
          }
          return "#0D0D0D14";
        }}
        linkWidth={(l: FGLink) =>
          l.type === "node-relation" ? 1.2 :
          l.type === "cluster-member" ? 0.4 : 0.4
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
