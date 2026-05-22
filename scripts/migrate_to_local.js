#!/usr/bin/env node
/**
 * DB에 저장된 Instagram CDN URL들을 즉시 로컬 public/feed-images/{slug}/ 로 다운로드.
 * 다운로드 성공한 항목은 DB의 feed_thumbnails / thumbnail_url을 로컬 경로로 교체.
 *
 * Instagram CDN URL은 24~48시간 후 만료되므로, 빨리 돌려야 함.
 *
 * 사용법:
 *   node scripts/migrate_to_local.js
 */

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

const FEED_DIR = path.join(__dirname, "..", "public", "feed-images");

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

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

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  // 외부 URL이 저장된 브랜드만 (이미 /feed-images/ 로 시작하면 스킵)
  const { rows: brands } = await db.query(`
    SELECT id, name, thumbnail_url, feed_thumbnails
    FROM brands
    WHERE thumbnail_url IS NOT NULL
      AND thumbnail_url NOT LIKE '/feed-images/%'
    ORDER BY name
  `);

  console.log(`마이그레이션 대상: ${brands.length}개 브랜드\n`);

  let success = 0, fail = 0, partial = 0;

  for (let i = 0; i < brands.length; i++) {
    const brand = brands[i];
    const slug = slugify(brand.name);
    process.stdout.write(`[${i + 1}/${brands.length}] ${brand.name} (${slug}) ... `);

    const remoteUrls = brand.feed_thumbnails && brand.feed_thumbnails.length
      ? brand.feed_thumbnails
      : (brand.thumbnail_url ? [brand.thumbnail_url] : []);

    if (!remoteUrls.length) {
      console.log("URL 없음 (스킵)");
      continue;
    }

    // 폴더 비우기
    try {
      await fs.promises.rm(path.join(FEED_DIR, slug), { recursive: true, force: true });
    } catch {}

    const results = await Promise.all(
      remoteUrls.slice(0, 9).map((url, idx) => downloadOne(url, slug, idx))
    );
    const localUrls = results.filter(Boolean);

    if (!localUrls.length) {
      console.log("다운로드 실패 (URL 만료?)");
      fail++;
      continue;
    }

    await db.query(
      `UPDATE brands SET thumbnail_url=$1, feed_thumbnails=$2, updated_at=NOW() WHERE id=$3`,
      [localUrls[0], localUrls, brand.id]
    );

    if (localUrls.length === remoteUrls.length) {
      console.log(`✓ ${localUrls.length}장 저장`);
      success++;
    } else {
      console.log(`△ ${localUrls.length}/${remoteUrls.length}장만 성공`);
      partial++;
    }
  }

  await db.end();
  console.log(`\n완료 — 전부 성공: ${success}, 일부 성공: ${partial}, 실패: ${fail}`);
}

main().catch(console.error);
