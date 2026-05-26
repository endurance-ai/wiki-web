// 클러스터(스타일 노드) 한국어 → 영문 표시 라벨.
// DB의 name 필드(= style_nodes.name_ko)를 그대로 두고 UI 표시만 영문화.
// 키는 prefix 제거된 순수 한글명(name_ko). 값은 style_nodes.name_en.
// 002 마이그레이션으로 클러스터가 public.style_nodes(20개)로 교체되며 라벨도 갱신.
const LABELS: Record<string, string> = {
  "컨템퍼러리 캐주얼": "Contemporary Casual",
  "프렌치 이펄리스": "French Effortless",
  "스칸디 미니멀": "Scandi Minimal",
  "콰이엇 럭셔리": "Quiet Luxury",
  "모던 프렙": "Modern Prep",
  "헤리티지 아메리카나": "Heritage Americana",
  "재패니즈 워크웨어": "Japanese Workwear",
  "사토리얼 테일러링": "Sartorial Tailoring",
  "NY 뉴프렙 스트릿": "NY New Prep Street",
  "스케이트 스트릿": "Skate Street",
  "아트스쿨 인디 스트릿": "Art-school Indie Street",
  "럭셔리 스트릿": "Luxury Streetwear",
  "다크 아방가르드": "Dark Avant-garde",
  "벨지언 컨셉추얼": "Belgian Conceptual",
  "런웨이 익스페리먼탈": "Runway Experimental",
  "럭셔리 맥시멀리스트": "Luxury Maximalist",
  "로맨틱 페미닌": "Romantic Feminine",
  "센슈얼 페미닌": "Sensual Feminine",
  "고프코어 아웃도어": "Gorpcore Outdoor",
  "이탈리안 테크럭셔리": "Italian Tech-luxury",
  "미분류": "Unclassified",
};

// 접두사("A-1 ", "B ", "F-3 " 등) 제거. 새 name_ko 에는 prefix 가 없지만
// 과거 데이터/혹시 모를 prefix 대비해 유지 (no-op on clean names).
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
