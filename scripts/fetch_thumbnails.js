#!/usr/bin/env node
/**
 * 브랜드명 → 인스타그램 핸들 후보 직접 조회 + 피드 수집
 *
 * 전략:
 * 1. 브랜드명에서 핸들 후보 자동 생성 (032c → ["032c", "032cmagazine", "032cofficial"])
 * 2. apify/instagram-profile-scraper 로 각 후보 직접 조회 (검색 X)
 * 3. 패션 브랜드 여부 점수화 → 최고점 후보 선택
 * 4. 최소 점수 미달 시 저장 안 함
 *
 * 사용법:
 *   node scripts/fetch_thumbnails.js              # thumbnail_url 없는 브랜드만
 *   node scripts/fetch_thumbnails.js --recheck    # 전체 재검증
 *   node scripts/fetch_thumbnails.js --test 032c  # 단일 브랜드 테스트 (DB 저장 안 함)
 */

const { ApifyClient } = require("apify-client");
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

// .env.local 로드
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)/);
    if (m) {
      const k = m[1].trim(), v = m[2].trim().replace(/^"|"$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const APIFY_TOKEN = process.env.APIFY_TOKEN;
if (!APIFY_TOKEN) { console.error("APIFY_TOKEN 필요 (.env.local 또는 환경변수)"); process.exit(1); }

const RECHECK   = process.argv.includes("--recheck");
const TEST_IDX  = process.argv.indexOf("--test");
const TEST_NAME = TEST_IDX !== -1 ? process.argv[TEST_IDX + 1] : null;

const apify = new ApifyClient({ token: APIFY_TOKEN });

// ── 핸들 후보 생성 ──────────────────────────────────────────────
function generateHandleCandidates(brandName) {
  const base = brandName
    .toLowerCase()
    .replace(/['''`]/g, "")          // 어포스트로피 제거
    .replace(/\s+/g, "")             // 공백 제거
    .replace(/[^a-z0-9._]/g, "");   // 허용 문자만

  // 공백 → 언더스코어 버전
  const underscored = brandName
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._]/g, "");

  // 공백 → 점 버전
  const dotted = brandName
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._]/g, "");

  const candidates = new Set([
    base,
    underscored,
    dotted,
    base + "official",
    base + "_official",
    base + "studio",
    base + "brand",
    base + "world",
    base + "paris",
    base + "nyc",
    base + "london",
  ]);

  // 숫자로 시작하는 브랜드 (032c, 424, 44labelgroup 등) — 그대로도 핸들이 될 수 있음
  return [...candidates].filter(h => h.length >= 2 && h.length <= 30);
}

// ── 매칭 점수 ───────────────────────────────────────────────────
function normalize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const FASHION_BIO_KEYWORDS = [
  "fashion", "brand", "studio", "collection", "wear", "clothing",
  "apparel", "label", "design", "couture", "atelier", "maison",
  "knitwear", "denim", "streetwear", "luxury", "boutique", "ready-to-wear",
];

const CELEB_BIO_KEYWORDS = [
  "actor", "actress", "singer", "rapper", "musician", "artist",
  "model", "influencer", "youtuber", "comedian", "athlete",
];

function scoreMatch(brandName, profile) {
  const bn       = normalize(brandName);
  const handle   = normalize(profile.username || "");
  const fullName = normalize(profile.fullName || "");
  const followers = profile.followersCount || 0;
  const bio      = (profile.biography || "").toLowerCase();
  const bioNorm  = normalize(bio);

  let score = 0;

  // ── 핸들 매칭 (가장 강한 신호) ──
  if (handle === bn)                               score += 10;
  else if (handle.startsWith(bn) && bn.length >= 3) score += 7;
  else if (handle.includes(bn) && bn.length >= 4)  score += 5;
  else if (bn.includes(handle) && handle.length >= 4) score += 3;

  // ── fullName 매칭 ──
  if (fullName === bn)                              score += 6;
  else if (fullName.includes(bn) && bn.length >= 3) score += 3;

  // ── 패션 바이오 키워드 ──
  const fashionHits = FASHION_BIO_KEYWORDS.filter(k => bio.includes(k)).length;
  score += Math.min(fashionHits * 2, 6);

  // ── 셀럽/인플루언서 페널티 ──
  if (CELEB_BIO_KEYWORDS.some(k => bio.includes(k))) score -= 8;

  // ── 팔로워 범위 ──
  // 패션 브랜드 공식계정: 보통 1만~500만
  if (followers >= 10_000  && followers < 500_000)  score += 2;
  if (followers >= 500_000 && followers < 5_000_000) score += 1;
  if (followers > 10_000_000) score -= 5;  // 메가 셀럽
  if (followers < 1_000)      score -= 3;  // 유령 계정

  // ── 비공개 계정 페널티 ──
  if (profile.isPrivate) score -= 4;

  // ── 인증 계정 보너스 ──
  if (profile.verified) score += 3;

  return score;
}

// ── Apify 프로필 직접 조회 ──────────────────────────────────────
async function fetchProfiles(usernames) {
  if (!usernames.length) return [];

  const run = await apify.actor("apify/instagram-profile-scraper").call({
    usernames,
  });

  const { items } = await apify.dataset(run.defaultDatasetId).listItems();
  return items;
}

// ── 브랜드 1개 처리 ─────────────────────────────────────────────
async function fetchInstagramData(brandName) {
  const candidates = generateHandleCandidates(brandName);

  // 후보가 많으면 Apify 비용이 늘어나므로 최대 6개로 제한
  const batch = candidates.slice(0, 6);

  let profiles;
  try {
    profiles = await fetchProfiles(batch);
  } catch (e) {
    throw new Error(`Apify 오류: ${e.message}`);
  }

  if (!profiles.length) return null;

  const scored = profiles
    .filter(p => p.username)
    .map(p => ({ profile: p, score: scoreMatch(brandName, p) }))
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;

  const best = scored[0];

  // 최소 점수 10 미달이면 저장 안 함 (잘못된 매칭 방지)
  if (best.score < 10) return null;

  // 팔로워 5000명 미만은 브랜드 공식 계정이 아닐 가능성 높음
  if ((best.profile.followersCount || 0) < 5000) return null;

  const profile = best.profile;
  const handle  = profile.username;

  const posts = profile.latestPosts || profile.posts || [];
  const feedThumbnails = posts
    .slice(0, 9)
    .map(p => p.displayUrl || p.thumbnailUrl || p.imageUrl)
    .filter(Boolean);

  return {
    handle,
    score: best.score,
    followers: profile.followersCount,
    instagramUrl:  `https://www.instagram.com/${handle}/`,
    thumbnailUrl:  feedThumbnails[0] || profile.profilePicUrlHD || profile.profilePicUrl || null,
    feedThumbnails,
    allCandidates: scored.map(s => `@${s.profile.username}(${s.score})`).join(", "),
  };
}

// ── 메인 ────────────────────────────────────────────────────────
async function main() {
  // --test 모드: 단일 브랜드 확인 (DB 저장 안 함)
  if (TEST_NAME) {
    console.log(`테스트: "${TEST_NAME}"`);
    console.log(`후보 핸들: ${generateHandleCandidates(TEST_NAME).join(", ")}\n`);
    const data = await fetchInstagramData(TEST_NAME);
    if (!data) {
      console.log("매칭 없음 (score < 7)");
    } else {
      console.log(`✓ @${data.handle} (score:${data.score}, 팔로워:${data.followers?.toLocaleString()})`);
      console.log(`  후보 결과: ${data.allCandidates}`);
      console.log(`  피드 ${data.feedThumbnails.length}장`);
      console.log(`  썸네일: ${data.thumbnailUrl}`);
    }
    return;
  }

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const NODE_FILTER = process.env.NODE_FILTER || "";
  const query = RECHECK
    ? `SELECT b.id, b.name FROM brands b LEFT JOIN brand_nodes n ON b.node_id = n.id ${NODE_FILTER ? `WHERE n.name LIKE '${NODE_FILTER}%'` : ""} ORDER BY b.name`
    : `SELECT b.id, b.name FROM brands b LEFT JOIN brand_nodes n ON b.node_id = n.id WHERE b.thumbnail_url IS NULL ${NODE_FILTER ? `AND n.name LIKE '${NODE_FILTER}%'` : ""} ORDER BY b.name`;

  const { rows: brands } = await db.query(query);
  console.log(`처리할 브랜드: ${brands.length}개 ${RECHECK ? "(재검증 모드)" : ""}\n`);

  let success = 0, skipped = 0, fail = 0;

  for (let i = 0; i < brands.length; i++) {
    const brand = brands[i];
    process.stdout.write(`[${i + 1}/${brands.length}] ${brand.name} ... `);

    try {
      const data = await fetchInstagramData(brand.name);

      if (!data) {
        console.log("매칭 없음 (스킵)");
        skipped++;
        continue;
      }

      await db.query(
        `UPDATE brands
         SET instagram_handle = $1,
             instagram_url    = $2,
             thumbnail_url    = $3,
             feed_thumbnails  = $4,
             updated_at       = NOW()
         WHERE id = $5`,
        [data.handle, data.instagramUrl, data.thumbnailUrl, data.feedThumbnails, brand.id]
      );

      console.log(`✓ @${data.handle} (score:${data.score}, 팔로워:${data.followers?.toLocaleString()}, 피드:${data.feedThumbnails.length}장)`);
      console.log(`   후보: ${data.allCandidates}`);
      success++;
    } catch (e) {
      console.log(`오류: ${e.message}`);
      fail++;
    }

    // Apify rate limit 방지
    await new Promise(r => setTimeout(r, 1000));
  }

  await db.end();
  console.log(`\n완료 — 성공: ${success}, 스킵: ${skipped}, 오류: ${fail}`);
}

main().catch(console.error);
