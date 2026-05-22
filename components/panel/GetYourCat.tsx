"use client";

import { useEffect, useState } from "react";
import { useUIStore } from "@/lib/store";

const HELVETICA = '"Helvetica Neue", Helvetica, "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif';

const TELEGRAM_HANDLE = "@kiko_fashion_ai_bot";
const TELEGRAM_URL = "https://t.me/kiko_fashion_ai_bot";
const SMS_LANDING = "https://kiko.app/install";

const qr = (data: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data=${encodeURIComponent(data)}`;

type Channel = "imessage" | "telegram";

export default function GetYourCat() {
  const open = useUIStore((s) => s.getCatOpen);
  const setOpen = useUIStore((s) => s.setGetCatOpen);

  const [channel, setChannel] = useState<Channel>("imessage");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("+82");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 의도된 리셋: 모달 닫힐 때 폼 초기화
      setSent(false);
      setPhone("");
      setChannel("imessage");
    }
  }, [open]);

  const phoneValid = phone.replace(/\D/g, "").length >= 8;

  const handleSendSMS = () => {
    if (!phoneValid) return;
    setSent(true);
  };

  if (!open) return null;

  const cardBg = channel === "imessage" ? "#A8E0B0" : "#C9D8E2";

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        pointerEvents: "auto",
        background: "rgba(20, 20, 25, 0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        animation: "catOverlayIn 0.2s ease-out",
        fontFamily: HELVETICA,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "min(480px, 100%)",
          borderRadius: "28px",
          background: "#F0F0F2",
          padding: "20px",
          boxShadow:
            "0 30px 80px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.06)",
          color: "#0D0D0D",
          animation: "catModalIn 0.32s cubic-bezier(0.2, 0.9, 0.25, 1)",
        }}
      >
        {/* Floating close button */}
        <button
          type="button"
          onPointerDown={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            border: "1px solid rgba(13,13,13,0.1)",
            background: "transparent",
            color: "#0D0D0D",
            fontSize: "13px",
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
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          ✕
        </button>

        {/* Headline + cat */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "0px",
            marginTop: "0",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: "2.7rem",
              letterSpacing: "-0.03em",
              lineHeight: 0.95,
              flexShrink: 0,
            }}
          >
            Get your
            <br />
            own cat.
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/kiko-cat.png"
            alt="Kiko"
            style={{
              height: "calc(2.7rem * 0.95 * 2)",
              width: "auto",
              objectFit: "contain",
              objectPosition: "bottom",
              display: "block",
              flexShrink: 0,
              marginLeft: "-6px",
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>

        <div
          style={{
            fontSize: "0.95rem",
            lineHeight: 1.4,
            color: "rgba(13,13,13,0.6)",
            marginBottom: "18px",
            maxWidth: "380px",
            letterSpacing: "-0.005em",
          }}
        >
          Drop any link. Kiko finds a piece
          <br />
          with the same vibe — for less.
        </div>

        {/* Sample conversation preview */}
        <ChatPreview channel={channel} />

        {/* Section header */}
        <div
          style={{
            fontWeight: 700,
            fontSize: "1.7rem",
            letterSpacing: "-0.03em",
            lineHeight: 1,
            margin: "24px 0 12px",
          }}
        >
          Install
          <span style={{ color: "rgba(13,13,13,0.3)" }}> no app, 10s</span>
        </div>

        {/* Channel toggle — solid color pills matching the design system */}
        <div
          style={{
            display: "flex",
            gap: "6px",
            marginBottom: "8px",
          }}
        >
          {(["imessage", "telegram"] as const).map((c, i) => {
            const isActive = channel === c;
            const baseColor = c === "imessage" ? "#A8E0B0" : "#C9D8E2";
            return (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                style={{
                  flex: 1,
                  border: "none",
                  background: isActive ? baseColor : "rgba(13,13,13,0.04)",
                  color: "#0D0D0D",
                  fontFamily: HELVETICA,
                  fontSize: "1rem",
                  fontWeight: 700,
                  letterSpacing: "-0.015em",
                  padding: "14px 16px",
                  borderRadius: "14px",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  opacity: isActive ? 1 : 0.55,
                  transition: "background 0.2s ease, opacity 0.2s ease, transform 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isActive)
                    e.currentTarget.style.transform = "translateX(2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateX(0)";
                }}
              >
                <span>{c === "imessage" ? "iMessage" : "Telegram"}</span>
                <span
                  style={{
                    fontSize: "1.4rem",
                    fontWeight: 700,
                    letterSpacing: "-0.03em",
                    lineHeight: 1,
                    opacity: 0.5,
                  }}
                >
                  {`0${i + 1}`}
                </span>
              </button>
            );
          })}
        </div>

        {/* Channel card — fixed min-height so modal doesn't shift between tabs */}
        <div
          style={{
            background: cardBg,
            borderRadius: "18px",
            padding: "20px",
            minHeight: "168px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            transition: "background 0.3s ease",
          }}
        >
          {channel === "imessage" ? (
            <ImessagePanel
              phone={phone}
              setPhone={setPhone}
              country={country}
              setCountry={setCountry}
              sent={sent}
              onSend={handleSendSMS}
              phoneValid={phoneValid}
            />
          ) : (
            <TelegramPanel />
          )}
        </div>
      </div>

      <style>{`
        @keyframes catOverlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes catModalIn {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

function ImessagePanel({
  phone,
  setPhone,
  country,
  setCountry,
  sent,
  onSend,
  phoneValid,
}: {
  phone: string;
  setPhone: (v: string) => void;
  country: string;
  setCountry: (v: string) => void;
  sent: boolean;
  onSend: () => void;
  phoneValid: boolean;
}) {
  return (
    <>
      <div
        style={{
          fontWeight: 700,
          fontSize: "1.1rem",
          letterSpacing: "-0.015em",
          marginBottom: "12px",
        }}
      >
        Text yourself the link
      </div>

      {sent ? (
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: "12px",
            padding: "14px 16px",
            fontSize: "0.9rem",
            fontWeight: 500,
            color: "#0D0D0D",
            lineHeight: 1.4,
          }}
        >
          ✓ Link sent. Check your messages.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              style={{
                border: "none",
                background: "#FFFFFF",
                borderRadius: "12px",
                padding: "0 12px",
                fontFamily: HELVETICA,
                fontWeight: 600,
                fontSize: "0.95rem",
                color: "#0D0D0D",
                cursor: "pointer",
                outline: "none",
                appearance: "none",
                WebkitAppearance: "none",
              }}
            >
              <option value="+82">+82</option>
              <option value="+1">+1</option>
              <option value="+44">+44</option>
              <option value="+81">+81</option>
              <option value="+86">+86</option>
            </select>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010 0000 0000"
              style={{
                flex: 1,
                border: "none",
                background: "#FFFFFF",
                borderRadius: "12px",
                padding: "14px 16px",
                fontFamily: HELVETICA,
                fontWeight: 500,
                fontSize: "0.95rem",
                color: "#0D0D0D",
                outline: "none",
                letterSpacing: "-0.005em",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSend();
              }}
            />
            <button
              type="button"
              disabled={!phoneValid}
              onClick={onSend}
              style={{
                border: "none",
                borderRadius: "12px",
                width: "48px",
                background: phoneValid ? "#0D0D0D" : "rgba(13,13,13,0.15)",
                color: phoneValid ? "#fff" : "rgba(13,13,13,0.35)",
                fontFamily: HELVETICA,
                fontSize: "1.2rem",
                fontWeight: 700,
                cursor: phoneValid ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "transform 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (phoneValid)
                  e.currentTarget.style.transform = "translateX(2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateX(0)";
              }}
            >
              →
            </button>
          </div>
          <div
            style={{
              fontSize: "0.8rem",
              color: "rgba(13,13,13,0.55)",
              marginTop: "10px",
              lineHeight: 1.35,
            }}
          >
            We&apos;ll text you the install link.
          </div>
        </>
      )}
    </>
  );
}

function TelegramPanel() {
  return (
    <>
      <div
        style={{
          fontWeight: 700,
          fontSize: "1.1rem",
          letterSpacing: "-0.015em",
          marginBottom: "12px",
        }}
      >
        Open Kiko in Telegram
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <QRBlock data={TELEGRAM_URL} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontWeight: 600,
              fontSize: "0.95rem",
              letterSpacing: "-0.01em",
              color: "#0D0D0D",
              textDecoration: "none",
              borderBottom: "1px solid rgba(13,13,13,0.25)",
            }}
          >
            {TELEGRAM_HANDLE}
          </a>
          <div
            style={{
              fontSize: "0.8rem",
              color: "rgba(13,13,13,0.55)",
              marginTop: "4px",
              lineHeight: 1.35,
            }}
          >
            Scan with your phone — or tap
            <br />
            the handle to open in Telegram.
          </div>
        </div>
      </div>
    </>
  );
}

type Scenario = {
  image: string;
  title: string;
  domain: string;
  products: Array<{ brand: string; item: string; price: string; save: string; color: string }>;
  purchased: { brand: string; item: string; price: string; saved: string };
};

const SCENARIOS: Record<Channel, Scenario> = {
  imessage: {
    image: "/preview-bag.png",
    title: "Miu Miu Wander",
    domain: "tiktok.com",
    products: [
      { brand: "Polène", item: "Numéro Un", price: "$580", save: "−55%", color: "#D9C9B2" },
      { brand: "Mansur Gavriel", item: "Bucket", price: "$495", save: "−62%", color: "#C9B8A0" },
      { brand: "Wandler", item: "Hortensia", price: "$620", save: "−52%", color: "#E5D4BC" },
      { brand: "Demellier", item: "Tokyo", price: "$415", save: "−68%", color: "#B5A48C" },
      { brand: "Cuyana", item: "Mini Tote", price: "$268", save: "−79%", color: "#D6C9B5" },
      { brand: "Strathberry", item: "Mosaic", price: "$545", save: "−58%", color: "#A89880" },
      { brand: "Jamie Haller", item: "Petite", price: "$320", save: "−75%", color: "#C2B19A" },
      { brand: "Mark Cross", item: "Grace Box", price: "$690", save: "−47%", color: "#A18F76" },
    ],
    purchased: { brand: "Polène", item: "Numéro Un", price: "$580", saved: "$710" },
  },
  telegram: {
    image: "/preview-denim.jpg",
    title: "find me jeans like these",
    domain: "pinterest.com",
    products: [
      { brand: "A.P.C.", item: "Petit Standard", price: "$245", save: "−85%", color: "#2C3E5C" },
      { brand: "Acne Studios", item: "River", price: "$290", save: "−82%", color: "#1F2A3D" },
      { brand: "Carhartt WIP", item: "Single Knee", price: "$148", save: "−92%", color: "#3A4A6B" },
      { brand: "Levi's", item: "501 Original", price: "$98", save: "−96%", color: "#26354F" },
      { brand: "Wrangler", item: "Cowboy Cut", price: "$69", save: "−98%", color: "#1A2438" },
      { brand: "Stan Ray", item: "Painter Pant", price: "$128", save: "−94%", color: "#465A7C" },
      { brand: "Edwin", item: "Slim Tapered", price: "$185", save: "−90%", color: "#2E3E5A" },
      { brand: "Lee", item: "Rider Jean", price: "$79", save: "−97%", color: "#3D506E" },
    ],
    purchased: { brand: "A.P.C.", item: "Petit Standard", price: "$245", saved: "$980" },
  },
};

function ChatPreview({ channel }: { channel: Channel }) {
  const userBg = channel === "imessage" ? "#007AFF" : "#3B95E2";
  const userFg = "#FFFFFF";
  const botBg = channel === "imessage" ? "#E9E9EB" : "#FFFFFF";
  const botFg = "#0D0D0D";
  const scenario = SCENARIOS[channel];

  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: "16px",
        padding: "14px",
        marginBottom: "4px",
        boxShadow: "inset 0 0 0 1px rgba(13,13,13,0.04)",
        overflow: "hidden",
      }}
    >
      {/* Compact scene container */}
      <div
        key={channel}
        className="kiko-scene-wrap"
        style={{
          position: "relative",
          height: "152px",
          overflow: "hidden",
        }}
      >
        {/* SCENE A — Real-time chat (bubbles accumulate top-to-bottom) */}
        <div className="kiko-scene kiko-scene-A" style={sceneStyle}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              height: "100%",
              gap: "6px",
              padding: "2px 2px 0",
            }}
          >
            {/* User link — right, rich preview card with product image */}
            <div className="kiko-msg kiko-msg-1" style={{ display: "flex", justifyContent: "flex-end" }}>
              <div
                style={{
                  background: userBg,
                  color: userFg,
                  borderRadius: "16px 16px 4px 16px",
                  overflow: "hidden",
                  width: "180px",
                  boxShadow: "0 2px 8px rgba(0,122,255,0.18)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={scenario.image}
                  alt={scenario.title}
                  style={{
                    width: "100%",
                    height: "90px",
                    objectFit: "cover",
                    objectPosition: "center 75%",
                    display: "block",
                    background: "#FFFFFF",
                  }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                <div
                  style={{
                    padding: "8px 12px 9px",
                    lineHeight: 1.25,
                    letterSpacing: "-0.005em",
                  }}
                >
                  <div style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                    {scenario.title}
                  </div>
                  <div
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 500,
                      opacity: 0.7,
                      marginTop: "1px",
                    }}
                  >
                    {scenario.domain}
                  </div>
                </div>
              </div>
            </div>

            {/* Kiko "Hold on" — left, with avatar */}
            <div
              className="kiko-msg kiko-msg-2"
              style={{
                display: "flex",
                justifyContent: "flex-start",
                alignItems: "flex-end",
                gap: "6px",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/kiko-cat.png"
                alt="Kiko"
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  objectPosition: "center top",
                  background: "#FFFFFF",
                  border: "1px solid rgba(13,13,13,0.08)",
                  flexShrink: 0,
                }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              <div
                style={{
                  background: botBg,
                  color: botFg,
                  fontSize: "0.84rem",
                  fontWeight: 500,
                  lineHeight: 1.3,
                  padding: "8px 12px",
                  borderRadius: "16px 16px 16px 4px",
                  letterSpacing: "-0.005em",
                  border: channel === "telegram" ? "1px solid rgba(13,13,13,0.06)" : "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span
                  className="kiko-spinner"
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    border: "1.5px solid rgba(13,13,13,0.15)",
                    borderTopColor: "rgba(13,13,13,0.6)",
                    display: "inline-block",
                  }}
                />
                one sec, on the hunt 🐾
              </div>
            </div>

            {/* Kiko "Found 8 matches" — left, with avatar */}
            <div
              className="kiko-msg kiko-msg-3"
              style={{
                display: "flex",
                justifyContent: "flex-start",
                alignItems: "flex-end",
                gap: "6px",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/kiko-cat.png"
                alt="Kiko"
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  objectPosition: "center top",
                  background: "#FFFFFF",
                  border: "1px solid rgba(13,13,13,0.08)",
                  flexShrink: 0,
                }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              <div
                style={{
                  background: botBg,
                  color: botFg,
                  fontSize: "0.84rem",
                  fontWeight: 600,
                  lineHeight: 1.3,
                  padding: "8px 12px",
                  borderRadius: "16px 16px 16px 4px",
                  letterSpacing: "-0.005em",
                  border: channel === "telegram" ? "1px solid rgba(13,13,13,0.06)" : "none",
                }}
              >
                got 8 🐾 same vibe, up to{" "}
                <span style={{ color: "#1B8A3A", fontWeight: 700 }}>−79%</span>
              </div>
            </div>
          </div>
        </div>

        {/* SCENE B — Product list scrolling */}
        <div className="kiko-scene kiko-scene-B" style={sceneStyle}>
          <div
            style={{
              position: "relative",
              height: "100%",
              overflow: "hidden",
              maskImage:
                "linear-gradient(to bottom, transparent 0%, #000 12%, #000 88%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent 0%, #000 12%, #000 88%, transparent 100%)",
            }}
          >
            <div className="kiko-product-track">
              {[...scenario.products, ...scenario.products].map((p, i) => (
                <div
                  key={`${p.brand}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "7px 10px",
                    background: "rgba(13,13,13,0.025)",
                    border: "1px solid rgba(13,13,13,0.05)",
                    borderRadius: "10px",
                    marginBottom: "5px",
                  }}
                >
                  <div
                    style={{
                      width: "30px",
                      height: "30px",
                      borderRadius: "7px",
                      background: p.color,
                      flexShrink: 0,
                      boxShadow: "inset 0 1px 2px rgba(0,0,0,0.06)",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "0.76rem",
                        fontWeight: 700,
                        letterSpacing: "-0.01em",
                        color: "#0D0D0D",
                        lineHeight: 1.1,
                      }}
                    >
                      {p.brand}
                    </div>
                    <div
                      style={{
                        fontSize: "0.68rem",
                        color: "rgba(13,13,13,0.5)",
                        marginTop: "1px",
                        lineHeight: 1.1,
                      }}
                    >
                      {p.item}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        letterSpacing: "-0.015em",
                        color: "#0D0D0D",
                        lineHeight: 1,
                      }}
                    >
                      {p.price}
                    </div>
                    <div
                      style={{
                        fontSize: "0.6rem",
                        fontWeight: 700,
                        color: "#1B8A3A",
                        marginTop: "2px",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {p.save}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SCENE C — Purchase complete finale (last in DOM = on top) */}
        <div
          className="kiko-scene kiko-scene-C"
          style={{ ...sceneStyle, zIndex: 2 }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "8px",
              textAlign: "center",
            }}
          >
            <div
              className="kiko-check"
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, #2EBD52 0%, #1B8A3A 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow:
                  "0 4px 10px rgba(27,138,58,0.18), inset 0 1px 0 rgba(255,255,255,0.25)",
              }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  stroke="#FFFFFF"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#0D0D0D",
              }}
            >
              Purchase complete
            </div>
            <div
              style={{
                fontSize: "0.78rem",
                color: "rgba(13,13,13,0.55)",
                fontWeight: 500,
              }}
            >
              {scenario.purchased.brand} {scenario.purchased.item} ·{" "}
              <span style={{ color: "#0D0D0D", fontWeight: 700 }}>
                {scenario.purchased.price}
              </span>{" "}
              ·{" "}
              <span style={{ color: "#1B8A3A", fontWeight: 700 }}>
                saved {scenario.purchased.saved}
              </span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .kiko-scene {
          opacity: 0;
          animation-fill-mode: both;
          animation-iteration-count: infinite;
          animation-duration: 16s;
          animation-timing-function: cubic-bezier(0.2, 0.9, 0.25, 1);
        }
        /* Scene A: 0–42%   Chat builds */
        /* Scene B: 44–80%  Product scroll */
        /* Scene C: 82–98%  Purchase complete */
        .kiko-scene-A { animation-name: kikoScA; }
        .kiko-scene-B { animation-name: kikoScB; }
        .kiko-scene-C { animation-name: kikoScC; }

        @keyframes kikoScA {
          0%   { opacity: 1; transform: none; }
          34%  { opacity: 1; transform: none; }
          38%  { opacity: 0; transform: translateY(-24px) scale(0.96); }
          100% { opacity: 0; }
        }
        @keyframes kikoScB {
          0%, 36%  { opacity: 0; transform: translateY(60px) scale(0.94); }
          42%      { opacity: 1; transform: translateY(0) scale(1); }
          78%      { opacity: 1; transform: translateY(0) scale(1); }
          82%      { opacity: 0; transform: translateY(-18px) scale(0.96); }
          100%     { opacity: 0; }
        }
        @keyframes kikoScC {
          0%, 82%  { opacity: 0; transform: translateY(14px) scale(0.88); }
          86%      { opacity: 1; transform: translateY(0) scale(1); }
          96%      { opacity: 1; transform: translateY(0) scale(1); }
          100%     { opacity: 0; transform: translateY(-10px) scale(0.96); }
        }

        /* Check circle — drops, hits, bounces UP once, settles */
        .kiko-check {
          animation: kikoCheckDrop 16s ease-out infinite;
          animation-fill-mode: both;
          transform-origin: center center;
          will-change: transform, opacity;
        }
        @keyframes kikoCheckDrop {
          0%, 83%  { transform: translateY(-30px); opacity: 0; }
          89%      { transform: translateY(4px);   opacity: 1; }   /* brief ground touch */
          92%      { transform: translateY(0);     opacity: 1; }   /* rests */
          97%      { transform: translateY(0);     opacity: 1; }
          100%     { transform: translateY(-10px); opacity: 0; }
        }


        /* Bubbles inside Scene A — sequenced like a real text convo */
        .kiko-msg {
          opacity: 0;
          animation-fill-mode: both;
          animation-iteration-count: infinite;
          animation-duration: 16s;
          animation-timing-function: cubic-bezier(0.2, 0.9, 0.25, 1);
        }
        .kiko-msg-1 { animation-name: kikoMsg1; }
        .kiko-msg-2 { animation-name: kikoMsg2; }
        .kiko-msg-3 { animation-name: kikoMsg3; }

        @keyframes kikoMsg1 {
          0%, 2%   { opacity: 0; transform: translateY(6px) translateX(8px); }
          6%       { opacity: 1; transform: translateY(0) translateX(0); }
          42%      { opacity: 1; transform: translateY(0) translateX(0); }
          100%     { opacity: 1; }
        }
        @keyframes kikoMsg2 {
          0%, 12%  { opacity: 0; transform: translateY(6px) translateX(-8px); }
          16%      { opacity: 1; transform: translateY(0) translateX(0); }
          42%      { opacity: 1; transform: translateY(0) translateX(0); }
          100%     { opacity: 1; }
        }
        @keyframes kikoMsg3 {
          0%, 26%  { opacity: 0; transform: translateY(6px) translateX(-8px); }
          30%      { opacity: 1; transform: translateY(0) translateX(0); }
          42%      { opacity: 1; transform: translateY(0) translateX(0); }
          100%     { opacity: 1; }
        }

        .kiko-product-track {
          animation: kikoProductScroll 3s linear infinite;
        }
        @keyframes kikoProductScroll {
          0%   { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }

        .kiko-spinner {
          animation: kikoSpin 0.8s linear infinite;
        }
        @keyframes kikoSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const sceneStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
};

function QRBlock({ data }: { data: string }) {
  return (
    <div
      style={{
        width: "84px",
        height: "84px",
        background: "#FFFFFF",
        borderRadius: "10px",
        padding: "6px",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qr(data)}
        alt="QR code"
        width={72}
        height={72}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </div>
  );
}

// SMS_LANDING is referenced from QR build when sending SMS link via QR scan
// (kept as named export indirectly for future use)
void SMS_LANDING;
