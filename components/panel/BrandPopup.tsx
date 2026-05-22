"use client";

import { useEffect, useState } from "react";
import { useUIStore } from "@/lib/store";
import { clusterLabel } from "@/lib/cluster-labels";
import { brandDescription } from "@/lib/brand-descriptions";
import { useT, useTKeyword, useLocale } from "@/lib/i18n";

interface Keyword { id: string; keyword: string; }
interface NodeMeta { id: string; name: string; color: string | null; }
interface BrandFull {
  id: string;
  name: string;
  instagramHandle: string | null;
  instagramUrl: string | null;
  thumbnailUrl: string | null;
  feedThumbnails: string[];
  node: NodeMeta | null;
  keywords: Keyword[];
}

const HELVETICA = '"Helvetica Neue", Helvetica, "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif';

function thumbSrc(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("/") ? url : `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

export default function BrandPopup() {
  const focusedBrandId = useUIStore((s) => s.focusedBrandId);
  const setFocusedBrandId = useUIStore((s) => s.setFocusedBrandId);
  const [brand, setBrand] = useState<BrandFull | null>(null);
  const t = useT();
  const tKw = useTKeyword();
  const locale = useLocale();

  // Fetch full brand details when id changes
  useEffect(() => {
    if (!focusedBrandId) {
      setBrand(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/brands/${focusedBrandId}`)
      .then((r) => r.json())
      .then((b: BrandFull) => {
        if (!cancelled) setBrand(b);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [focusedBrandId]);

  // ESC to close
  useEffect(() => {
    if (!focusedBrandId) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusedBrandId(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [focusedBrandId, setFocusedBrandId]);

  // Lock body scroll while open
  useEffect(() => {
    if (!focusedBrandId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [focusedBrandId]);

  if (!focusedBrandId) return null;

  const close = () => setFocusedBrandId(null);
  const src = brand ? thumbSrc(brand.thumbnailUrl) : null;
  const styleLabel = brand?.node ? clusterLabel(brand.node.name, locale) : null;
  const desc = brand ? brandDescription(brand.name) : null;
  const igUrl = brand?.instagramHandle
    ? brand.instagramUrl ?? `https://www.instagram.com/${brand.instagramHandle.replace(/^@/, "")}/`
    : null;

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(20, 20, 25, 0.5)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px",
        animation: "brandOverlayIn 0.2s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          background: "#F0F0F2",
          width: "100%",
          maxWidth: 880,
          maxHeight: "90vh",
          overflowY: "auto",
          borderRadius: "28px",
          padding: "20px",
          fontFamily: HELVETICA,
          boxShadow:
            "0 30px 80px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.06)",
          animation: "brandModalIn 0.32s cubic-bezier(0.2, 0.9, 0.25, 1)",
        }}
      >
        {/* Close */}
        <button
          onClick={close}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: "1px solid rgba(13,13,13,0.1)",
            background: "transparent",
            color: "#0D0D0D",
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.15s ease",
            zIndex: 2,
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "rgba(13,13,13,0.06)")
          }
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          ✕
        </button>

        {!brand ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "100px 24px",
            }}
          >
            <span
              aria-label={t("loading")}
              style={{
                width: "26px",
                height: "26px",
                borderRadius: "50%",
                border: "2.5px solid rgba(13,13,13,0.12)",
                borderTopColor: "rgba(13,13,13,0.6)",
                display: "inline-block",
                animation: "brandLoadingSpin 0.8s linear infinite",
              }}
            />
            <style>{`
              @keyframes brandLoadingSpin {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 340px) 1fr",
              gap: 24,
              padding: "12px 8px 8px",
              alignItems: "start",
            }}
          >
            {/* Left: thumbnail card */}
            <div
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                background: "rgba(13,13,13,0.05)",
                borderRadius: "18px",
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
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              ) : (
                <span
                  style={{
                    fontSize: "4rem",
                    fontWeight: 700,
                    letterSpacing: "-0.03em",
                    color: "#0D0D0D",
                    opacity: 0.2,
                  }}
                >
                  {brand.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            {/* Right: info */}
            <div style={{ minWidth: 0 }}>
              {/* Stacked headline — Brand / Cluster, both big, cluster muted */}
              <div
                style={{
                  fontSize: "2.7rem",
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  lineHeight: 0.98,
                  color: "#0D0D0D",
                  marginBottom: 18,
                  paddingRight: 40,
                  wordBreak: "keep-all",
                }}
              >
                <div>{brand.name}</div>
                {styleLabel && (
                  <div style={{ color: "rgba(13,13,13,0.3)" }}>
                    {styleLabel}
                  </div>
                )}
              </div>

              {/* Instagram pill button */}
              {igUrl && (
                <a
                  href={igUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "#0D0D0D",
                    background: "rgba(13,13,13,0.06)",
                    borderRadius: "999px",
                    padding: "7px 14px",
                    textDecoration: "none",
                    marginBottom: 22,
                    transition: "background 0.15s ease",
                    letterSpacing: "-0.005em",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "rgba(13,13,13,0.1)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "rgba(13,13,13,0.06)")
                  }
                >
                  @{brand.instagramHandle?.replace(/^@/, "")}
                  <span style={{ opacity: 0.5 }}>↗</span>
                </a>
              )}

              {/* Description — plain text, no card */}
              {desc ? (
                <div
                  style={{
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: "#0D0D0D",
                    opacity: 0.78,
                    marginBottom: 18,
                    whiteSpace: "pre-line",
                    letterSpacing: "-0.005em",
                  }}
                >
                  {desc}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: "rgba(13,13,13,0.4)",
                    marginBottom: 18,
                    fontStyle: "italic",
                    letterSpacing: "-0.005em",
                  }}
                >
                  {t("noDescription")}
                </div>
              )}

              {/* Keyword pills */}
              {brand.keywords.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {brand.keywords.map((kw) => (
                    <span
                      key={kw.id}
                      style={{
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        color: "#0D0D0D",
                        background: "rgba(13,13,13,0.06)",
                        padding: "6px 12px",
                        borderRadius: "999px",
                        letterSpacing: "-0.005em",
                      }}
                    >
                      {tKw(kw.keyword)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes brandOverlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes brandModalIn {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
