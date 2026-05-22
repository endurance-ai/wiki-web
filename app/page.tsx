import GraphCanvas from "@/components/graph/GraphCanvas";
import BottomPanel from "@/components/panel/BottomPanel";
import BrandPopup from "@/components/panel/BrandPopup";
import AskKikoAI from "@/components/panel/AskKikoAI";
import GetYourCat from "@/components/panel/GetYourCat";
import LocaleToggle from "@/components/panel/LocaleToggle";
import MusicToggle from "@/components/panel/MusicToggle";

const HELVETICA = '"Helvetica Neue", Helvetica, "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif';

export default function Home() {
  return (
    <div className="w-full" style={{ background: "#F0F0F2" }}>
      {/* Top — Graph area (70vh) */}
      <div style={{ height: "70vh", position: "relative" }}>
        {/* Top-left wordmark — Helvetica, sparse, typographic */}
        <header
          className="absolute top-0 left-0 z-10"
          style={{ padding: "12px 0 0 20px", pointerEvents: "none" }}
        >
          <span
            style={{
              fontFamily: HELVETICA,
              fontWeight: 400,
              fontSize: "2.8rem",
              letterSpacing: "-0.01em",
              color: "#0D0D0D",
              textTransform: "uppercase",
              lineHeight: 1,
              display: "block",
            }}
          >
            Kikoweb
          </span>
          <AskKikoAI />
        </header>

        <GraphCanvas />
      </div>

      {/* Bottom — Style tabs + brand grid (in normal page flow) */}
      <BottomPanel />

      {/* Brand popup — triggered by card click or graph brand-node click */}
      <BrandPopup />

      {/* Install Kiko modal — triggered by Ask@kikoai click */}
      <GetYourCat />

      {/* Music + Language toggles — fixed top-right */}
      <MusicToggle />
      <LocaleToggle />
    </div>
  );
}
