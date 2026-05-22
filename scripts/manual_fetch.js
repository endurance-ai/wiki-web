#!/usr/bin/env node
/**
 * 매칭 실패한 브랜드에 수동 핸들 매핑을 적용하여 Apify 호출 + 로컬 다운로드.
 *
 * 사용법:
 *   node scripts/manual_fetch.js
 */

const { ApifyClient } = require("apify-client");
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

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

// 수동 매핑 — 브랜드명 → 실제 인스타 핸들
const HANDLE_MAP = {
  "1017 ALYX 9SM":                  "alyxstudio",
  "11 by Boris Bidjan Saberi":      "borisbidjansaberi",
  "132 5. ISSEY MIYAKE":            "132_5_issey_miyake",
  "A DICIANNOVEVENTITRE":           "a1923_official",
  "AIREI":                          "airei.studio",
  "B1ARCHIVE":                      "b1archive",
  "Comme des Garçons":              "commedesgarcons",
  "Comme des Garçons Comme des Garçons": "commedesgarcons",
  "Craig Green":                    "craig__green__studio",
  "DEVOA":                          "devoa_official",
  "Duran Lantink":                  "duranlantink",
  "Factor's":                       "factors_paris",
  "HODAKOVA":                       "hodakovaofficial",
  "Homme Plissé Issey Miyake":      "hommeplisseisseymiyake",
  "Kanghyuk":                       "kanghyuk____",
  "Moncler Genius":                 "moncler",
  "Moncler Grenoble":               "monclergrenoble",
  "NEMEN®":                         "nemen_world",
  "PAF":                            "post_archive_faction",
  "Post Archive Faction (PAF)":     "post_archive_faction",
  "Prototypes":                     "prototypes____",
  "Uncertain Factor":               "uncertainfactor",
  "VEIN":                           "vein____",
  "Virón":                          "viron.world",
  "VITELLI":                        "vitelli_official",
  "_J.L - A.L_":                    "_j.l_a.l_",
};

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
  const apify = new ApifyClient({ token: process.env.APIFY_TOKEN });
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const names = Object.keys(HANDLE_MAP);
  console.log(`처리할 브랜드: ${names.length}개\n`);

  let success = 0, fail = 0;

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const handle = HANDLE_MAP[name];
    process.stdout.write(`[${i + 1}/${names.length}] ${name} → @${handle} ... `);

    try {
      const run = await apify.actor("apify/instagram-profile-scraper").call({
        usernames: [handle],
      });
      const { items } = await apify.dataset(run.defaultDatasetId).listItems();
      const profile = items[0];

      if (!profile || !profile.username) {
        console.log("프로필 없음 (핸들 틀림)");
        fail++;
        continue;
      }

      const posts = profile.latestPosts || profile.posts || [];
      const remoteUrls = posts
        .slice(0, 9)
        .map(p => p.displayUrl || p.thumbnailUrl || p.imageUrl)
        .filter(Boolean);

      // 폴더 비우기
      const slug = slugify(name);
      try { await fs.promises.rm(path.join(FEED_DIR, slug), { recursive: true, force: true }); } catch {}

      const dlResults = await Promise.all(remoteUrls.map((u, idx) => downloadOne(u, slug, idx)));
      let localUrls = dlResults.filter(Boolean);

      // 피드 없으면 프로필 사진 폴백
      if (!localUrls.length) {
        const pic = profile.profilePicUrlHD || profile.profilePicUrl;
        if (pic) {
          const fallback = await downloadOne(pic, slug, 0);
          if (fallback) localUrls = [fallback];
        }
      }

      // DB 업데이트 (이름으로 매칭)
      const updateRes = await db.query(
        `UPDATE brands
           SET instagram_handle = $1,
               instagram_url    = $2,
               thumbnail_url    = $3,
               feed_thumbnails  = $4,
               updated_at       = NOW()
         WHERE name = $5
         RETURNING id`,
        [
          profile.username,
          `https://www.instagram.com/${profile.username}/`,
          localUrls[0] || null,
          localUrls,
          name,
        ]
      );

      if (!updateRes.rowCount) {
        console.log(`✗ DB에서 "${name}" 찾을 수 없음`);
        fail++;
      } else {
        console.log(`✓ @${profile.username} (팔로워:${profile.followersCount?.toLocaleString() || "?"}, ${localUrls.length}장)`);
        success++;
      }
    } catch (e) {
      console.log(`오류: ${e.message}`);
      fail++;
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  await db.end();
  console.log(`\n완료 — 성공: ${success}, 실패: ${fail}`);
}

main().catch(console.error);
