"use client";

import { useEffect, useState } from "react";
import { brandDescription } from "@/lib/brand-descriptions";

interface Keyword { id: string; keyword: string; }
interface BrandNode { name: string; color: string; }
interface Brand {
  id: string;
  name: string;
  instagramHandle: string | null;
  thumbnailUrl: string | null;
  instagramUrl: string | null;
  feedThumbnails: string[];
  node: BrandNode | null;
  keywords: Keyword[];
}

const HN = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const TITLE_STYLE: React.CSSProperties = {
  fontFamily: HN,
  fontSize: 40,
  fontWeight: 700,
  letterSpacing: "-0.03em",
  lineHeight: 1.0,
};

export default function BrandModal({ brandId, onClose }: { brandId: string; onClose: () => void }) {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [editing, setEditing] = useState(false);
  const [handleDraft, setHandleDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [keywordsDraft, setKeywordsDraft] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/brands/${brandId}`).then(r => r.json()).then((b: Brand) => {
      setBrand(b);
      setHandleDraft(b.instagramHandle ?? "");
      setNameDraft(b.name);
      setKeywordsDraft(b.keywords.map(k => k.keyword).join(", "));
    });
  }, [brandId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  async function fetchInstagramFeed() {
    if (!brand) return;
    const handle = handleDraft.trim().replace(/^@/, "");
    if (!handle) {
      setStatus("핸들을 입력하세요");
      return;
    }
    setSaving(true);
    setStatus("인스타그램 조회 중…");
    try {
      const res = await fetch(`/api/brands/${brand.id}/refresh-instagram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || "오류");
        return;
      }
      setBrand(data.brand);
      setHandleDraft(data.brand.instagramHandle);
      setStatus(`✓ @${data.brand.instagramHandle} 피드 ${data.meta.feedCount}장`);
    } catch (e) {
      setStatus(`오류: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveMetadata() {
    if (!brand) return;
    setSaving(true);
    setStatus("저장 중…");
    try {
      const res = await fetch(`/api/brands/${brand.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameDraft.trim(),
          keywords: keywordsDraft.split(",").map(k => k.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || "오류");
        return;
      }
      setBrand(prev => prev ? { ...prev, name: data.name, keywords: data.keywords } : prev);
      setStatus("✓ 저장됨");
    } catch (e) {
      setStatus(`오류: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setSaving(false);
    }
  }

  const inputBase: React.CSSProperties = {
    ...TITLE_STYLE,
    background: "transparent",
    border: "none",
    outline: "none",
    padding: 0,
    margin: 0,
    width: "100%",
    display: "block",
    boxShadow: "inset 0 -1px 0 #222",
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div className="fixed z-50" style={{
        bottom: 0,
        left: 0,
        right: 0,
        width: "100%",
        maxHeight: "70vh",
        overflowY: "auto",
        background: "#0D0D0D",
      }}>
        {!brand ? (
          <div style={{ fontFamily: HN, padding: 48, fontSize: 13, color: "#444" }}>Loading</div>
        ) : (
          <div style={{ padding: "32px 40px 32px", display: "flex", gap: 48, alignItems: "flex-start" }}>

            {/* 좌: 텍스트 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* 브랜드명 */}
              {editing ? (
                <input
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  style={{ ...inputBase, color: "#ffffff" }}
                />
              ) : (
                <div style={{ ...TITLE_STYLE, color: "#ffffff" }}>{brand.name}</div>
              )}

              {/* 노드명 */}
              {brand.node && (
                <div style={{ ...TITLE_STYLE, color: "#333" }}>{brand.node.name}</div>
              )}

              {/* 인스타 핸들 */}
              {editing ? (
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ ...TITLE_STYLE, color: "#666" }}>@</span>
                  <input
                    value={handleDraft}
                    onChange={e => setHandleDraft(e.target.value.replace(/^@/, ""))}
                    placeholder="instagram_handle"
                    style={{ ...inputBase, color: "#ffffff", flex: 1 }}
                  />
                </div>
              ) : (
                brand.instagramHandle && (
                  <a
                    href={brand.instagramUrl ?? `https://www.instagram.com/${brand.instagramHandle}/`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ ...TITLE_STYLE, color: "#333", textDecoration: "none", display: "block" }}
                  >
                    @{brand.instagramHandle}
                  </a>
                )
              )}

              {/* 키워드 */}
              {editing ? (
                <textarea
                  value={keywordsDraft}
                  onChange={e => setKeywordsDraft(e.target.value)}
                  placeholder="키워드, 쉼표로 구분"
                  rows={2}
                  style={{
                    ...inputBase,
                    color: "#ffffff",
                    resize: "vertical",
                    marginTop: 4,
                    lineHeight: 1.1,
                  }}
                />
              ) : (
                brand.keywords.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    {brand.keywords.map((kw) => (
                      <div key={kw.id} style={{ ...TITLE_STYLE, color: "#ffffff" }}>
                        {kw.keyword}
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* 브랜드 설명문 (나무위키 스타일) */}
              {(() => {
                const desc = brandDescription(brand.name);
                if (!desc) return null;
                return (
                  <div
                    style={{
                      marginTop: 24,
                      maxWidth: 720,
                      fontFamily: HN,
                      fontSize: 13,
                      lineHeight: 1.7,
                      color: "#cfcfcf",
                      whiteSpace: "pre-line",
                    }}
                  >
                    {desc}
                  </div>
                );
              })()}

              {/* 편집 모드 액션 바 */}
              {editing && (
                <div style={{
                  marginTop: 20,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontFamily: HN,
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}>
                  <button
                    onClick={fetchInstagramFeed}
                    disabled={saving}
                    style={editBtn(false)}
                  >
                    Fetch Instagram
                  </button>
                  <button
                    onClick={saveMetadata}
                    disabled={saving}
                    style={editBtn(false)}
                  >
                    Save
                  </button>
                  {status && (
                    <span style={{ color: "#888", textTransform: "none", letterSpacing: "0.02em", fontSize: 12 }}>
                      {status}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* 우: 피드 */}
            {brand.feedThumbnails?.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, width: 480, flexShrink: 0 }}>
                {brand.feedThumbnails.slice(0, 9).map((url, i) => (
                  <a key={i}
                    href={brand.instagramUrl ?? `https://www.instagram.com/${brand.instagramHandle}/`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ aspectRatio: "1", display: "block", overflow: "hidden", background: "#1a1a1a" }}
                  >
                    <img
                      src={url.startsWith("/") ? url : `/api/proxy-image?url=${encodeURIComponent(url)}`}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  </a>
                ))}
              </div>
            )}

          </div>
        )}

        {/* 우상단 컨트롤 */}
        <div style={{ position: "absolute", top: 16, right: 20, display: "flex", gap: 14, alignItems: "center" }}>
          <button
            onClick={() => {
              setEditing(v => !v);
              setStatus(null);
            }}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: HN, fontSize: 11, color: editing ? "#ffffff" : "#444",
              letterSpacing: "0.12em", textTransform: "uppercase",
              padding: 0,
            }}
          >
            {editing ? "Done" : "Edit"}
          </button>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: HN, fontSize: 11, color: "#444", letterSpacing: "0.08em",
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>
      </div>
    </>
  );
}

function editBtn(active: boolean): React.CSSProperties {
  return {
    background: "transparent",
    border: "1px solid #333",
    color: active ? "#0D0D0D" : "#ffffff",
    backgroundColor: active ? "#ffffff" : "transparent",
    fontFamily: HN,
    fontSize: 11,
    letterSpacing: "0.12em",
    padding: "8px 14px",
    cursor: "pointer",
    textTransform: "uppercase",
  };
}
