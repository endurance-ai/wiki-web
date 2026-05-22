#!/usr/bin/env node
/**
 * brand_nodes.csv 의 wiki 열에서 instagram_handle을 읽어서
 * confidence >= threshold 인 브랜드만 Apify로 프로필/피드를 가져온다.
 *
 * - DB에 같은 name이 있는 브랜드만 업데이트 (신규 자동생성 안 함)
 * - 이미 feed_thumbnails가 있으면 스킵 (--recheck로 강제)
 * - 이미지는 즉시 public/feed-images/{slug}/ 로 영구 저장 (CDN URL 만료 회피)
 *
 * 사용법:
 *   node scripts/ingest_wiki_instagram.js                       # dry-run, 전체 미리보기
 *   node scripts/ingest_wiki_instagram.js --live                # 실제 실행
 *   node scripts/ingest_wiki_instagram.js --live --limit 10     # 10개만
 *   node scripts/ingest_wiki_instagram.js --live --threshold 0.9
 *   node scripts/ingest_wiki_instagram.js --live --concurrency 3
 *   node scripts/ingest_wiki_instagram.js --live --recheck      # 이미 받은 것도 다시
 *   node scripts/ingest_wiki_instagram.js --live --only "Acne Studios,Lemaire"
 */

const { ApifyClient } = require("apify-client");
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

// ── .env.local 로드 ──────────────────────────────────────────────
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

// ── 옵션 파싱 ────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name) { return args.includes(name); }
function opt(name, dflt) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : dflt;
}

const LIVE = flag("--live");
const RECHECK = flag("--recheck");
const LIMIT = parseInt(opt("--limit", "0"), 10) || 0;
const THRESHOLD = parseFloat(opt("--threshold", "0.85"));
const CONCURRENCY = parseInt(opt("--concurrency", "3"), 10);
const ONLY = opt("--only", "");
const ONLY_SET = ONLY ? new Set(ONLY.split(",").map(s => s.trim())) : null;
const CSV_PATH = opt("--csv", path.join(process.env.HOME, "Downloads/brand_nodes.csv"));

const APIFY_TOKEN = process.env.APIFY_TOKEN;
if (LIVE && !APIFY_TOKEN) {
  console.error("APIFY_TOKEN 필요 (.env.local)");
  process.exit(1);
}

// ── CSV 파서 (큰따옴표 안 콤마/줄바꿈 지원, "" 이스케이프) ───────
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ── slugify (lib/image-storage.ts 와 동일) ───────────────────────
function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ── 핸들 정규화 ──────────────────────────────────────────────────
function cleanHandle(raw) {
  if (!raw) return null;
  let h = String(raw).trim();
  const urlMatch = h.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
  if (urlMatch) h = urlMatch[1];
  h = h.replace(/^@/, "").replace(/\/$/, "").toLowerCase();
  if (!/^[a-zA-Z0-9._]+$/.test(h)) return null;
  return h;
}

// ── 이미지 다운로드 ──────────────────────────────────────────────
const FEED_DIR = path.join(__dirname, "..", "public", "feed-images");

async function downloadOne(url, slug, index) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const brandDir = path.join(FEED_DIR, slug);
    await fs.promises.mkdir(brandDir, { recursive: true });
    const ct = res.headers.get("content-type") || "";
    const ext = ct.includes("webp") ? "webp" : ct.includes("png") ? "png" : "jpg";
    const filename = `${index}.${ext}`;
    await fs.promises.writeFile(path.join(brandDir, filename), buf);
    return `/feed-images/${slug}/${filename}`;
  } catch {
    return null;
  }
}

async function downloadFeedImages(urls, brandName) {
  const slug = slugify(brandName);
  try { await fs.promises.rm(path.join(FEED_DIR, slug), { recursive: true, force: true }); } catch {}
  const results = await Promise.all(
    urls.slice(0, 9).map((u, i) => downloadOne(u, slug, i))
  );
  return { slug, localUrls: results.filter(Boolean) };
}

// ── Apify 호출 ───────────────────────────────────────────────────
async function fetchProfile(apify, handle) {
  const run = await apify.actor("apify/instagram-profile-scraper").call({
    usernames: [handle],
  });
  const { items } = await apify.dataset(run.defaultDatasetId).listItems();
  return items[0] || null;
}

// ── 한 브랜드 처리 ───────────────────────────────────────────────
async function processBrand(db, apify, target) {
  const { dbId, name, handle } = target;

  const profile = await fetchProfile(apify, handle);
  if (!profile || !profile.username) {
    return { ok: false, reason: "프로필 없음" };
  }

  const posts = (profile.latestPosts || profile.posts || []);
  const remoteUrls = posts
    .slice(0, 9)
    .map(p => p.displayUrl || p.thumbnailUrl || p.imageUrl)
    .filter(Boolean);

  const { localUrls } = await downloadFeedImages(remoteUrls, name);

  let thumbnailUrl = localUrls[0] || null;
  if (!thumbnailUrl) {
    const profilePic = profile.profilePicUrlHD || profile.profilePicUrl;
    if (profilePic) {
      const { localUrls: pl } = await downloadFeedImages([profilePic], name);
      thumbnailUrl = pl[0] || null;
    }
  }

  await db.query(
    `UPDATE brands
     SET instagram_handle=$1, instagram_url=$2, thumbnail_url=$3, feed_thumbnails=$4, updated_at=NOW()
     WHERE id=$5`,
    [
      profile.username,
      `https://www.instagram.com/${profile.username}/`,
      thumbnailUrl,
      localUrls,
      dbId,
    ]
  );

  return {
    ok: true,
    feedCount: localUrls.length,
    followers: profile.followersCount,
  };
}

// ── 동시성 제한 풀 ───────────────────────────────────────────────
async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    const i = cursor++;
    if (i >= items.length) return;
    results[i] = await worker(items[i], i);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return results;
}

// ── main ─────────────────────────────────────────────────────────
async function main() {
  console.log(`[설정] threshold=${THRESHOLD}  concurrency=${CONCURRENCY}  live=${LIVE}  recheck=${RECHECK}  limit=${LIMIT || "all"}`);
  console.log(`[CSV] ${CSV_PATH}\n`);

  // CSV 읽기
  const text = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parseCSV(text);
  const header = rows[0];
  const nameIdx = header.indexOf("brand_name");
  const wikiIdx = header.indexOf("wiki");
  if (nameIdx === -1 || wikiIdx === -1) {
    console.error("CSV 헤더에서 brand_name / wiki 못 찾음");
    process.exit(1);
  }

  const stats = {
    total: 0,
    badJson: 0,
    notOk: 0,
    noHandle: 0,
    belowThreshold: 0,
    eligible: 0,
  };

  const candidates = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < header.length) continue;
    const name = row[nameIdx];
    const wikiStr = row[wikiIdx];
    if (!name) continue;
    stats.total++;
    if (!wikiStr) { stats.noHandle++; continue; }

    let wiki;
    try { wiki = JSON.parse(wikiStr); }
    catch { stats.badJson++; continue; }

    if (wiki.status !== "ok") { stats.notOk++; continue; }

    const handle = cleanHandle(wiki.instagram_handle || wiki.instagram_url);
    if (!handle) { stats.noHandle++; continue; }

    const conf = wiki.confidence_breakdown?.instagram_handle ?? 0;
    if (conf < THRESHOLD) { stats.belowThreshold++; continue; }

    if (ONLY_SET && !ONLY_SET.has(name)) continue;

    stats.eligible++;
    candidates.push({ name, handle, conf });
  }

  console.log("[필터 통계]");
  console.log(`  CSV rows:              ${stats.total}`);
  console.log(`  wiki JSON 실패:        ${stats.badJson}`);
  console.log(`  status != ok:          ${stats.notOk}`);
  console.log(`  핸들 없음/형식 불량:   ${stats.noHandle}`);
  console.log(`  threshold(${THRESHOLD}) 미만:    ${stats.belowThreshold}`);
  console.log(`  → 통과:                ${stats.eligible}\n`);

  // DB 매칭
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows: dbRows } = await db.query(`SELECT id, name, feed_thumbnails FROM brands`);
  const byName = new Map(dbRows.map(b => [b.name, b]));

  const matched = [];
  let notInDb = 0, alreadyHas = 0;
  for (const c of candidates) {
    const dbBrand = byName.get(c.name);
    if (!dbBrand) { notInDb++; continue; }
    if (!RECHECK && dbBrand.feed_thumbnails && dbBrand.feed_thumbnails.length) {
      alreadyHas++;
      continue;
    }
    matched.push({ dbId: dbBrand.id, name: c.name, handle: c.handle, conf: c.conf });
  }

  console.log("[DB 매칭]");
  console.log(`  DB 내 brands 총:       ${dbRows.length}`);
  console.log(`  CSV에는 있고 DB엔 없음: ${notInDb}`);
  console.log(`  이미 피드 보유 (스킵): ${alreadyHas}  ${RECHECK ? "(--recheck로 무시됨)" : ""}`);
  console.log(`  → 처리 대상:           ${matched.length}\n`);

  // 샘플 5개 미리보기
  console.log("[샘플 5개]");
  matched.slice(0, 5).forEach(m => console.log(`  ${m.name.padEnd(30)} @${m.handle.padEnd(25)} conf=${m.conf}`));
  console.log();

  if (!LIVE) {
    console.log("DRY-RUN 종료. 실제 실행하려면 --live");
    await db.end();
    return;
  }

  const targets = LIMIT ? matched.slice(0, LIMIT) : matched;
  console.log(`[LIVE] ${targets.length}개 처리 시작 (concurrency=${CONCURRENCY})\n`);

  const apify = new ApifyClient({ token: APIFY_TOKEN });

  let done = 0, ok = 0, fail = 0;
  const failures = [];

  await runPool(targets, CONCURRENCY, async (t) => {
    const i = ++done;
    const tag = `[${i}/${targets.length}]`;
    try {
      const r = await processBrand(db, apify, t);
      if (r.ok) {
        ok++;
        console.log(`${tag} ✓ ${t.name.padEnd(30)} @${t.handle.padEnd(20)} feed=${r.feedCount} followers=${r.followers || "?"}`);
      } else {
        fail++;
        failures.push({ name: t.name, handle: t.handle, reason: r.reason });
        console.log(`${tag} ✗ ${t.name.padEnd(30)} @${t.handle.padEnd(20)} (${r.reason})`);
      }
    } catch (e) {
      fail++;
      const msg = e instanceof Error ? e.message : String(e);
      failures.push({ name: t.name, handle: t.handle, reason: msg });
      console.log(`${tag} ✗ ${t.name.padEnd(30)} @${t.handle.padEnd(20)} ERROR: ${msg}`);
    }
  });

  await db.end();

  console.log(`\n[완료] 성공 ${ok} / 실패 ${fail} / 합 ${targets.length}`);
  if (failures.length) {
    const failPath = path.join(__dirname, "ingest_wiki_instagram.failures.json");
    fs.writeFileSync(failPath, JSON.stringify(failures, null, 2));
    console.log(`실패 목록 → ${failPath}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
