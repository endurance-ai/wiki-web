import { useUIStore, type Locale } from "@/lib/store";

type Dict = Record<string, { en: string; ko: string }>;

const DICT: Dict = {
  // BottomPanel
  searchPlaceholder: { en: "Search brand", ko: "브랜드 검색" },
  allTab:            { en: "All",          ko: "전체" },
  noBrands:          { en: "No brands",    ko: "브랜드 없음" },

  // BrandPopup
  loading:           { en: "Loading",      ko: "불러오는 중" },
  noDescription:     {
    en: "No description yet — be the first to write one!",
    ko: "아직 설명이 없어요 — 첫 번째로 작성해보세요!",
  },

  // BrandPopup — Instagram feed
  instagram:         { en: "Instagram",    ko: "인스타그램" },
  posts:             { en: "posts",        ko: "게시물" },
  viewOnInstagram:   { en: "View on Instagram", ko: "원글 보기" },
  prevImage:         { en: "Previous image",     ko: "이전 이미지" },
  nextImage:         { en: "Next image",         ko: "다음 이미지" },
};

// Korean (DB) → English keyword translations
const KEYWORD_EN: Record<string, string> = {
  "가죽": "Leather",
  "고프코어": "Gorpcore",
  "구조적": "Structural",
  "그래픽": "Graphic",
  "기능성": "Functional",
  "니트웨어": "Knitwear",
  "데님": "Denim",
  "드레이프": "Drape",
  "러닝": "Running",
  "레이어드": "Layered",
  "모노톤": "Monotone",
  "밀리터리": "Military",
  "바디컨셔스": "Body-conscious",
  "보헤미안": "Bohemian",
  "볼륨 실루엣": "Volume Silhouette",
  "쉬어": "Sheer",
  "스트릿": "Street",
  "아웃도어": "Outdoor",
  "오버사이즈": "Oversize",
  "워크웨어": "Workwear",
  "유틸리티": "Utility",
  "장식적": "Decorative",
  "재구성": "Reconstructed",
  "재패니즈": "Japanese",
  "저지": "Jersey",
  "조형적": "Sculptural",
  "캐주얼": "Casual",
  "컬러 포인트": "Color Point",
  "테일러링": "Tailoring",
  "테크웨어": "Techwear",
  "트레일": "Trail",
  "해체주의": "Deconstruction",
  "헤리티지": "Heritage",
};

export type TKey = keyof typeof DICT;

export function translate(key: TKey, locale: Locale): string {
  return DICT[key]?.[locale] ?? DICT[key]?.en ?? key;
}

export function translateKeyword(kw: string, locale: Locale): string {
  if (locale === "ko") return kw; // DB stores Korean
  return KEYWORD_EN[kw] ?? kw;
}

export function useT() {
  const locale = useUIStore((s) => s.locale);
  return (key: TKey) => translate(key, locale);
}

export function useTKeyword() {
  const locale = useUIStore((s) => s.locale);
  return (kw: string) => translateKeyword(kw, locale);
}

export function useLocale() {
  return useUIStore((s) => s.locale);
}
