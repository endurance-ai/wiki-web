"use client";

import { useEffect, useState, useMemo } from "react";
import { useUIStore } from "@/lib/store";
import { clusterLabel } from "@/lib/cluster-labels";
import { useT, useLocale } from "@/lib/i18n";

interface ClusterNode {
  id: string;
  name: string;
  color: string | null;
  description?: string | null;
}

interface BrandData {
  id: string;
  name: string;
  instagramHandle: string | null;
  thumbnailUrl: string | null;
  nodeId: string | null;
  createdAt: string;
  node: ClusterNode | null;
}

const HELVETICA = '"Helvetica Neue", Helvetica, "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif';

function shortName(raw: string): string {
  return raw.replace(/^[A-Z][-\d]* /, "");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function thumbSrc(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("/") ? url : `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

export default function BottomPanel() {
  const [nodes, setNodes] = useState<ClusterNode[]>([]);
  const [brands, setBrands] = useState<BrandData[]>([]);
  const [search, setSearch] = useState("");
  const selectedClusterId = useUIStore((s) => s.selectedClusterId);
  const setSelectedClusterId = useUIStore((s) => s.setSelectedClusterId);
  const t = useT();
  const locale = useLocale();

  useEffect(() => {
    fetch("/api/nodes").then((r) => r.json()).then(setNodes).catch(() => {});
    fetch("/api/brands").then((r) => r.json()).then(setBrands).catch(() => {});
  }, []);

  const filteredBrands = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = selectedClusterId
      ? brands.filter((b) => b.nodeId === selectedClusterId)
      : brands;
    if (q) {
      list = list.filter((b) => b.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" })
    );
  }, [brands, selectedClusterId, search]);

  return (
    <div style={{ background: "#F0F0F2" }}>
      {/* Sticky header: search + style tabs — frosted glass */}
      <div
        style={{
          position: "sticky",
          top: 0,
          background: "rgba(240, 240, 242, 0.12)",
          backdropFilter: "blur(36px) saturate(180%)",
          WebkitBackdropFilter: "blur(36px) saturate(180%)",
          zIndex: 5,
          padding: "12px 20px 14px",
        }}
      >
        {/* Header row 1 — Search bar (LocaleToggle is fixed top-right, aligns visually) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "14px",
            padding: "0 60px 0 4px", // right padding reserves space for fixed LocaleToggle
            minHeight: "40px", // match toggle height so vertical alignment stays consistent
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            style={{ flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="7" stroke="#0D0D0D" strokeOpacity="0.55" strokeWidth="2" />
            <line
              x1="16.5"
              y1="16.5"
              x2="21"
              y2="21"
              stroke="#0D0D0D"
              strokeOpacity="0.55"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: HELVETICA,
              fontSize: "0.95rem",
              fontWeight: 500,
              letterSpacing: "-0.005em",
              color: "#0D0D0D",
              background: "transparent",
              border: "none",
              outline: "none",
              padding: 0,
            }}
          />
        </div>

        {/* Style tab strip — pill chips */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            overflowX: "auto",
            scrollbarWidth: "none",
            paddingBottom: "2px",
          }}
        >
          {[{ id: null as string | null, label: t("allTab") }, ...nodes.map((n) => ({ id: n.id, label: clusterLabel(n.name, locale) }))].map(
            (tab) => {
              const active = tab.id === selectedClusterId;
              return (
                <button
                  key={tab.id ?? "all"}
                  onClick={() => setSelectedClusterId(tab.id)}
                  style={{
                    fontFamily: HELVETICA,
                    fontSize: "0.82rem",
                    fontWeight: active ? 700 : 600,
                    letterSpacing: "-0.005em",
                    color: active ? "#FFFFFF" : "#0D0D0D",
                    background: active ? "#0D0D0D" : "rgba(13,13,13,0.05)",
                    border: "none",
                    borderRadius: "999px",
                    padding: "8px 14px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    transition: "background 0.18s ease, color 0.18s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!active)
                      e.currentTarget.style.background = "rgba(13,13,13,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active)
                      e.currentTarget.style.background = "rgba(13,13,13,0.05)";
                  }}
                >
                  {tab.label}
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* Brand card grid — masonry-style via CSS columns */}
      <div
        style={{
          columnCount: 5,
          columnGap: "10px",
          padding: "0 20px 24px",
        }}
      >
        {filteredBrands.length === 0 ? (
          <div
            style={{
              gridColumn: "1 / -1",
              padding: "80px 20px",
              textAlign: "center",
              fontFamily: HELVETICA,
              fontSize: "0.78rem",
              color: "#0D0D0D",
              opacity: 0.32,
            }}
          >
            {t("noBrands")}
          </div>
        ) : (
          filteredBrands.map((brand, idx) => {
            const cluster = brand.node;
            const styleLabel = cluster
              ? clusterLabel(cluster.name, locale)
              : locale === "ko"
              ? "미분류"
              : "Unsorted";
            const src = thumbSrc(brand.thumbnailUrl);
            // Vary thumbnail aspect + offset rotation per card for organic feel
            const ASPECTS = ["1 / 1", "4 / 5", "5 / 7", "3 / 4", "5 / 6", "1 / 1.05"];
            const aspect = ASPECTS[idx % ASPECTS.length];
            return (
              <button
                key={brand.id}
                onClick={() => useUIStore.getState().setFocusedBrandId(brand.id)}
                style={{
                  border: "none",
                  borderRadius: "20px",
                  padding: "20px 22px 24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  cursor: "pointer",
                  background: "#FFFFFF",
                  textDecoration: "none",
                  color: "inherit",
                  textAlign: "left",
                  fontFamily: "inherit",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                  breakInside: "avoid",
                  width: "100%",
                  marginBottom: "10px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-3px)";
                  e.currentTarget.style.boxShadow =
                    "0 12px 28px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 1px 2px rgba(0,0,0,0.03)";
                }}
              >
                {/* Category label */}
                <div
                  style={{
                    fontFamily: HELVETICA,
                    fontSize: "0.62rem",
                    color: "#0D0D0D",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  {styleLabel}
                </div>

                {/* Thumbnail — varied aspect ratio per card */}
                <div
                  style={{
                    width: "100%",
                    aspectRatio: aspect,
                    background: "#0D0D0D08",
                    borderRadius: "14px",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={brand.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    <span
                      style={{
                        fontFamily: HELVETICA,
                        fontSize: "3rem",
                        fontWeight: 300,
                        color: "#0D0D0D",
                        opacity: 0.25,
                      }}
                    >
                      {brand.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Brand name — large, light */}
                <div
                  style={{
                    fontFamily: HELVETICA,
                    fontWeight: 400,
                    fontSize: "2rem",
                    letterSpacing: "-0.025em",
                    color: "#0D0D0D",
                    lineHeight: 1.05,
                    wordBreak: "keep-all",
                    overflowWrap: "anywhere",
                    hyphens: "auto",
                  }}
                >
                  {brand.name}
                </div>

                {/* Meta — handle + date */}
                <div
                  style={{
                    marginTop: "auto",
                    fontFamily: HELVETICA,
                    fontSize: "0.86rem",
                    color: "#0D0D0D",
                    opacity: 0.55,
                    lineHeight: 1.55,
                  }}
                >
                  <div>
                    {brand.instagramHandle ? `@${brand.instagramHandle.replace(/^@/, "")}` : " "}
                  </div>
                  <div>{formatDate(brand.createdAt)}</div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
