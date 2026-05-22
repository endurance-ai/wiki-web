"use client";

import { useEffect, useRef, useState } from "react";

const MUSIC_SRC = "/music/kiko-loop.mp3"; // drop file at public/music/kiko-loop.mp3

export default function MusicToggle() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    audioRef.current = new Audio(MUSIC_SRC);
    audioRef.current.loop = true;
    audioRef.current.volume = 0.5;
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setPlaying(true))
        .catch((err) => {
          // Autoplay restrictions or missing file — silently fail
          console.warn("Music playback failed:", err);
        });
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? "Pause music" : "Play music"}
      style={{
        position: "fixed",
        top: "12px",
        right: "72px", // sits left of LocaleToggle (right: 20px, 40px wide)
        zIndex: 20,
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        border: "1.5px dashed rgba(13,13,13,0.3)",
        background: playing ? "rgba(13,13,13,0.06)" : "transparent",
        color: "#0D0D0D",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.18s ease, border-color 0.18s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(13,13,13,0.5)";
        if (!playing)
          e.currentTarget.style.background = "rgba(13,13,13,0.05)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(13,13,13,0.3)";
        if (!playing) e.currentTarget.style.background = "transparent";
      }}
    >
      {playing ? (
        // pause icon
        <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
          <rect x="0" y="0" width="4" height="14" rx="1" fill="#0D0D0D" />
          <rect x="8" y="0" width="4" height="14" rx="1" fill="#0D0D0D" />
        </svg>
      ) : (
        // play icon
        <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
          <path d="M1 1 L11 7 L1 13 Z" fill="#0D0D0D" />
        </svg>
      )}
    </button>
  );
}
