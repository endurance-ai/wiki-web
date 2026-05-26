"use client";

import { useEffect, useState } from "react";
import { useUIStore } from "@/lib/store";
import { clusterLabel } from "@/lib/cluster-labels";
import { brandDescription } from "@/lib/brand-descriptions";
import { useT, useTKeyword, useLocale } from "@/lib/i18n";
import { safeHref } from "@/lib/validation";
import { thumbSrc } from "@/lib/image-src";

interface Keyword { id: string; keyword: string; }
interface NodeMeta { id: string; name: string; color: string | null; }
interface Post {
  shortcode: string;
  postUrl: string | null;
  caption: string | null;
  imageUrls: string[];
  likesCount: number | null;
}
interface BrandFull {
  id: string;
  name: string;
  instagramHandle: string | null;
  instagramUrl: string | null;
  thumbnailUrl: string | null;
  feedThumbnails: string[];
  node: NodeMeta | null;
  keywords: Keyword[];
  posts: Post[];
}

const HELVETICA = '"Helvetica Neue", Helvetica, "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif';

export default function BrandPopup() {
  const focusedBrandId = useUIStore((s) => s.focusedBrandId);
  const setFocusedBrandId = useUIStore((s) => s.setFocusedBrandId);
  const [brand, setBrand] = useState<BrandFull | null>(null);
  // Lightbox state: index into brand.posts, plus the active image within that post.
  const [lightbox, setLightbox] = useState<{ post: number; image: number } | null>(null);
  const t = useT();
  const tKw = useTKeyword();
  const locale = useLocale();

  // Fetch full brand details when id changes
  useEffect(() => {
    if (!focusedBrandId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 의도된 리셋: 선택 해제 시 상세 비움
      setBrand(null);
      setLightbox(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/brands/${focusedBrandId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: BrandFull | null) => {
        // Guard against error payloads (404 returns { error } with no name) —
        // setting that as `brand` would crash brandDescription(brand.name).
        if (!cancelled) setBrand(b && typeof b.name === "string" ? b : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [focusedBrandId]);

  // ESC closes the lightbox first (if open), otherwise the whole popup.
  // ArrowLeft/Right cycle images while the lightbox is open.
  useEffect(() => {
    if (!focusedBrandId) return;
    const h = (e: KeyboardEvent) => {
      if (lightbox && brand) {
        const post = brand.posts[lightbox.post];
        const count = post?.imageUrls.length ?? 0;
        if (e.key === "Escape") {
          setLightbox(null);
          return;
        }
        if (e.key === "ArrowLeft") {
          setLightbox((s) => (s ? { ...s, image: Math.max(0, s.image - 1) } : s));
          return;
        }
        if (e.key === "ArrowRight") {
          setLightbox((s) => (s ? { ...s, image: Math.min(count - 1, s.image + 1) } : s));
          return;
        }
        return;
      }
      if (e.key === "Escape") setFocusedBrandId(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [focusedBrandId, setFocusedBrandId, lightbox, brand]);

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
  // SEC-07: instagramUrl is user-editable (PUT /api/brands/[id]) — only allow
  // http/https hrefs so a stored `javascript:`/`data:` URL can't execute on click.
  const igUrl = brand?.instagramHandle
    ? safeHref(brand.instagramUrl) ??
      `https://www.instagram.com/${brand.instagramHandle.replace(/^@/, "")}/`
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

        {/* Instagram feed — full-width grid of post covers below the header block */}
        {brand && brand.posts.length > 0 && (
          <div style={{ padding: "8px 8px 12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                  color: "#0D0D0D",
                }}
              >
                {t("instagram")}
              </span>
              <span style={{ fontSize: "0.8rem", color: "rgba(13,13,13,0.4)" }}>
                {brand.posts.length} {t("posts")}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 6,
              }}
            >
              {brand.posts.map((post, i) => {
                const cover = thumbSrc(post.imageUrls[0] ?? null);
                const isCarousel = post.imageUrls.length > 1;
                return (
                  <button
                    key={post.shortcode}
                    onClick={() => setLightbox({ post: i, image: 0 })}
                    aria-label={`${brand.name} — ${t("instagram")} ${i + 1}`}
                    style={{
                      position: "relative",
                      padding: 0,
                      border: "none",
                      borderRadius: 12,
                      overflow: "hidden",
                      cursor: "pointer",
                      aspectRatio: "1 / 1",
                      background: "rgba(13,13,13,0.05)",
                    }}
                  >
                    {cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                          transition: "transform 0.25s ease",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.transform = "scale(1.06)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.transform = "scale(1)")
                        }
                      />
                    )}
                    {isCarousel && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          width: 18,
                          height: 18,
                          borderRadius: 5,
                          background: "rgba(20,20,25,0.55)",
                          color: "#fff",
                          fontSize: 11,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          backdropFilter: "blur(2px)",
                        }}
                      >
                        ▦
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* In-modal carousel lightbox — above the popup (zIndex 200) */}
      {lightbox && brand && brand.posts[lightbox.post] && (
        (() => {
          const post = brand.posts[lightbox.post];
          const imgs = post.imageUrls;
          const idx = Math.min(lightbox.image, imgs.length - 1);
          const big = thumbSrc(imgs[idx] ?? null);
          const postHref =
            safeHref(post.postUrl) ??
            `https://www.instagram.com/p/${post.shortcode}/`;
          return (
            <div
              onClick={() => setLightbox(null)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 200,
                background: "rgba(15, 15, 20, 0.78)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "32px 24px",
                animation: "brandOverlayIn 0.18s ease-out",
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 14,
                  maxWidth: "min(92vw, 720px)",
                  width: "100%",
                  fontFamily: HELVETICA,
                }}
              >
                {/* Close */}
                <button
                  onClick={() => setLightbox(null)}
                  aria-label="Close"
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    border: "1px solid rgba(255,255,255,0.25)",
                    background: "rgba(20,20,25,0.5)",
                    color: "#fff",
                    fontSize: 14,
                    cursor: "pointer",
                    zIndex: 2,
                  }}
                >
                  ✕
                </button>

                {/* Image + nav */}
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {big && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={big}
                      alt={`${brand.name} — ${idx + 1}/${imgs.length}`}
                      style={{
                        maxWidth: "100%",
                        maxHeight: "70vh",
                        objectFit: "contain",
                        borderRadius: 14,
                        display: "block",
                        background: "rgba(0,0,0,0.2)",
                      }}
                    />
                  )}

                  {imgs.length > 1 && (
                    <>
                      <button
                        onClick={() =>
                          setLightbox((s) =>
                            s ? { ...s, image: Math.max(0, s.image - 1) } : s
                          )
                        }
                        disabled={idx === 0}
                        aria-label={t("prevImage")}
                        style={{
                          position: "absolute",
                          left: 8,
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          border: "none",
                          background: "rgba(20,20,25,0.5)",
                          color: "#fff",
                          fontSize: 18,
                          cursor: idx === 0 ? "default" : "pointer",
                          opacity: idx === 0 ? 0.3 : 1,
                        }}
                      >
                        ◀
                      </button>
                      <button
                        onClick={() =>
                          setLightbox((s) =>
                            s
                              ? { ...s, image: Math.min(imgs.length - 1, s.image + 1) }
                              : s
                          )
                        }
                        disabled={idx === imgs.length - 1}
                        aria-label={t("nextImage")}
                        style={{
                          position: "absolute",
                          right: 8,
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          border: "none",
                          background: "rgba(20,20,25,0.5)",
                          color: "#fff",
                          fontSize: 18,
                          cursor: idx === imgs.length - 1 ? "default" : "pointer",
                          opacity: idx === imgs.length - 1 ? 0.3 : 1,
                        }}
                      >
                        ▶
                      </button>
                    </>
                  )}

                  {imgs.length > 1 && (
                    <span
                      style={{
                        position: "absolute",
                        bottom: 10,
                        padding: "3px 10px",
                        borderRadius: 999,
                        background: "rgba(20,20,25,0.6)",
                        color: "#fff",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {idx + 1} / {imgs.length}
                    </span>
                  )}
                </div>

                {/* Caption + meta + source link */}
                <div
                  style={{
                    width: "100%",
                    maxWidth: 560,
                    color: "#fff",
                    textAlign: "center",
                  }}
                >
                  {post.caption && (
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.6,
                        opacity: 0.85,
                        whiteSpace: "pre-line",
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        marginBottom: 10,
                      }}
                    >
                      {post.caption}
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 14,
                      fontSize: "0.82rem",
                    }}
                  >
                    {post.likesCount != null && (
                      <span style={{ opacity: 0.85 }}>
                        ♥ {post.likesCount.toLocaleString()}
                      </span>
                    )}
                    <a
                      href={postHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "#fff",
                        fontWeight: 600,
                        textDecoration: "none",
                        opacity: 0.95,
                      }}
                    >
                      {t("viewOnInstagram")} ↗
                    </a>
                  </div>
                </div>
              </div>
            </div>
          );
        })()
      )}

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
