// 클러스터(스타일 노드) 한국어 → 영문 표시 라벨.
// DB의 name 필드를 그대로 두고 UI 표시만 영문화. 키는 prefix 제거된 순수 한글명.
const LABELS: Record<string, string> = {
  "트레일_아웃도어스트릿": "Trail / Outdoor Street",
  "하이엔드_럭셔리스트릿": "Luxury Street",
  "헤리티지_빈티지캐주얼": "Heritage / Vintage Casual",
  "얼터너티브_딥스트릿": "Alternative / Deep Street",
  "얼터너티브_캐주얼": "Alternative Casual",
  "미니멀_컨템퍼러리": "Minimal / Contemporary",
  "컨템퍼러리_캐주얼": "Contemporary Casual",
  "하이엔드_테크니컬&해체주의": "High-end Technical / Deconstruction",
  "미니멀_페미닌": "Minimal Feminine",
  "로맨틱_페미닌": "Romantic Feminine",
  "럭셔리_센슈얼페미닌": "Luxury Sensual Feminine",
  "테크니컬_고프코어": "Technical Gorpcore",
  "스트릿_캐주얼": "Street Casual",
  "재패니즈_워크웨어&유틸리티": "Japanese Workwear / Utility",
  "영_캐주얼": "Young Casual",
};

// 접두사("A-1 ", "B ", "F-3 " 등) 제거
function stripPrefix(raw: string): string {
  return raw.replace(/^[A-Z][-\d]* /, "");
}

// 한글 cluster name → 사람이 읽기 좋은 한글 라벨 (underscore → space)
function koLabel(stripped: string): string {
  return stripped.replace(/_/g, " ");
}

// DB의 한국어 name → 영문 라벨. 매핑 없으면 prefix 떼고 그대로 반환.
export function clusterLabel(raw: string, locale: "en" | "ko" = "en"): string {
  const stripped = stripPrefix(raw);
  if (locale === "ko") return koLabel(stripped);
  return LABELS[stripped] ?? koLabel(stripped);
}
