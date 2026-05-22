"use client";

import { useUIStore } from "@/lib/store";

const HELVETICA = '"Helvetica Neue", Helvetica, "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif';

export default function AskKikoAI() {
  const setOpen = useUIStore((s) => s.setGetCatOpen);

  return (
    <span
      onClick={() => setOpen(true)}
      style={{
        fontFamily: HELVETICA,
        fontWeight: 400,
        fontSize: "2.8rem",
        letterSpacing: "-0.01em",
        color: "#0D0D0D",
        textTransform: "uppercase",
        lineHeight: 1,
        display: "block",
        opacity: 0.3,
        cursor: "pointer",
        pointerEvents: "auto",
        transition: "opacity 0.2s ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.6")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.3")}
    >
      Ask@kikoai
    </span>
  );
}
