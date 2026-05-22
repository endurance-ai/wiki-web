"use client";

import { useUIStore } from "@/lib/store";

const HELVETICA = '"Helvetica Neue", Helvetica, "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif';

export default function LocaleToggle() {
  const locale = useUIStore((s) => s.locale);
  const setLocale = useUIStore((s) => s.setLocale);

  const next = locale === "en" ? "ko" : "en";
  const label = locale === "en" ? "EN" : "KR";

  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      aria-label={`Switch to ${next.toUpperCase()}`}
      style={{
        position: "fixed",
        top: "12px",
        right: "20px",
        zIndex: 20,
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        border: "1.5px dashed rgba(13,13,13,0.3)",
        background: "transparent",
        color: "#0D0D0D",
        fontFamily: HELVETICA,
        fontSize: "0.7rem",
        fontWeight: 700,
        letterSpacing: "0.05em",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.18s ease, border-color 0.18s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(13,13,13,0.05)";
        e.currentTarget.style.borderColor = "rgba(13,13,13,0.5)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderColor = "rgba(13,13,13,0.3)";
      }}
    >
      {label}
    </button>
  );
}
