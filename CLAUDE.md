@AGENTS.md

# kikoweb

패션 브랜드 노드 위키 — 15개 스타일 클러스터 + ~1079개 브랜드를 force-directed 그래프로 시각화하고, 사용자·팀이 함께 브랜드 DB를 쌓는 **참여형 위키**로 발전 중. (현재는 뷰 + 일부 쓰기 API, 인증·참여 모델은 구축 예정)

## 활성 진입점

- `/` — 그래프 캔버스(70vh) + 하단 스타일 탭/브랜드 그리드 + 브랜드 상세 팝업 + 설치 모달. 단일 페이지.
- 별도 `/admin` 없음 — 브랜드 추가/편집·인스타 피드 갱신은 팝업/패널 UI에서 처리.

## 작업 규칙

- 결정 지점이 모호하면 **혼자 가정하지 말고 먼저 질문할 것** (설계·기획·리팩터링 방향).
- 코드 변경 시 영향받는 `.moai/project/` 문서를 **함께 갱신** (stale 금지).
- `AGENTS.md` 경고 준수: 이 Next.js(16)는 학습 데이터와 다를 수 있음 → 코드 작성 전 `node_modules/next/dist/docs/` 의 해당 가이드 확인.

## 개발 명령어

```bash
npm run dev       # 개발 서버 (localhost:3500)
npm run build     # 프로덕션 빌드 (Turbopack)
npm run lint      # ESLint
```

> lightningcss 네이티브 바이너리 누락 시 홈 500 → `npm install lightningcss-darwin-arm64@<lightningcss버전> --no-save` (macOS, package.json 미변경).

## 기술 스택 (한눈에)

| 영역 | 기술 |
|---|---|
| 프레임워크 | Next.js 16 (App Router, Turbopack), React 19 |
| UI | Tailwind CSS v4, **shadcn/ui (도입 중)** — radix-ui · cva · clsx · tailwind-merge · lucide-react |
| 상태관리 | Zustand 5 (`lib/store.ts` — UI 상태) |
| 그래프 시각화 | react-force-graph-2d (canvas) + 커스텀 d3-force 2단계 시뮬 (`components/graph/GraphCanvas.tsx`) |
| **데이터 계층** | **raw `pg` (node-postgres) Pool + repository 패턴** (app/ai와 동일). ~~Prisma~~ 폐기 (2026-05-22) |
| DB | dev-app Postgres(54.116.104.193) **`wiki` 스키마** 격리. `public`/`ai` 스키마(kikoai 운영, 118k SKU)는 **건드리지 않음** |
| 인증 | next-auth v5 (설치만, **미구성** — 참여형 위키 단계서 구축) |
| 외부연동 | Apify (인스타 프로필 스크랩 — 실사용 경로), 이미지는 추후 AWS S3 저장 예정 |
| 배포 | Vercel 지향 (단 DB가 EC2라 네트워크 고려 필요) |

## 데이터 계층 규칙

- `lib/db.ts` — 공유 `pool` (pg Pool, `search_path=wiki`, sslmode 분리 + `rejectUnauthorized:false` for dev-app self-signed). app의 `pg-pool.ts`와 동일 패턴.
- `lib/repositories/{graph,nodes,brands,comments}.ts` — 타입 있는 raw SQL 쿼리. SQL alias로 **camelCase 키** 반환 (프론트 무변경).
- `lib/types.ts` — row 인터페이스 (BrandNode, Brand, BrandKeyword, BrandRelation, NodeRelation, BrandComment).
- `database/migrations/*.sql` — raw SQL 마이그레이션 (app 방식, 번호+헤더+`BEGIN;…COMMIT;`). 스키마 변경 시 새 번호 파일 추가.
- DB 연결정보는 `.env.local` (gitignore). `DATABASE_URL` → dev-app `wiki`.

## 코딩 컨벤션

- 컴포넌트: PascalCase, named export. `export default` 는 page/layout 만.
- 경로 별칭: `@/*` → 루트.
- 서버 모듈: `import "server-only"` 누출 가드 (pg Pool 등).
- shadcn/ui: `npx shadcn@latest add <component>`.
- 서버/클라이언트: RSC 기본, 인터랙션 시만 `"use client"`.
- 무필요 주석/추상화 금지. 기능 추가 외 정리는 별도 PR.
- i18n: EN/KO (`lib/i18n.ts`, `LocaleToggle`).

## 문서 매핑

| 작업 영역 | 읽을 doc |
|---|---|
| 제품 정의 / 기능 / 로드맵 | `.moai/project/product.md` |
| 디렉터리 구조 / API 라우트 맵 | `.moai/project/structure.md` |
| 스택 / DB 배포 / Known Issues | `.moai/project/tech.md` |
| 디자인 시스템 | `docs/DESIGN_SYSTEM.md` |
| 보안 감사 결과 | `.moai/reports/security-audit.md` (gitignore — 로컬 참조) |

## 알려진 부채 / 주의 (작업 시 인지)

- 🔴 쓰기/삭제 API 무인증, `/api/proxy-image` SSRF, 레이트리밋·입력검증 없음 → **보안 하드닝 예정** (상세: `.moai/reports/security-audit.md`).
- `tsc --noEmit` 미통과: `GraphCanvas.tsx`의 `node.vx/vy`(FGNode 미선언) 8건 — 기존 부채.
- 테스트 0 (development_mode = `ddd`).

## GitHub

- 조직: endurance-ai · 레포: [endurance-ai/wiki-web](https://github.com/endurance-ai/wiki-web) (public)
- 흐름: `feature` → PR → `dev` (직접 push 금지, `git add -A` 금지, force push 금지)
- Commit attribution: **`🗿 MoAI <email@mo.ai.kr>`** (MoAI-ADK 표준. `Co-Authored-By: Claude` 폐기)
