#!/usr/bin/env node
/**
 * Bulk-scrape Instagram feeds for wiki brands that have a handle, persist every
 * post image to S3 (bucket: wiki-web, prefix feed/), and store post rows in
 * wiki.brand_instagram_posts. Apify charges per PROFILE (not per image), so we
 * keep ALL carousel images per post at no extra cost.
 *
 * Data source : wiki.brand_nodes.instagram_handle (backfilled by migration 003)
 *               + public.brand_nodes.wiki confidence_breakdown for thresholding.
 * Idempotent  : brands that already have posts are skipped (--recheck to force).
 * Cost guard  : DRY-RUN by default; --max-profiles hard-caps spend ($5 ~= 1900).
 *
 * Usage:
 *   node scripts/ingest_instagram_posts.js                         # dry-run preview + cost estimate
 *   node scripts/ingest_instagram_posts.js --live --limit 30       # test batch (highest-confidence first)
 *   node scripts/ingest_instagram_posts.js --live                  # full run (all eligible, resumes)
 *   node scripts/ingest_instagram_posts.js --live --batch 50       # usernames per Apify run (default 50)
 *   node scripts/ingest_instagram_posts.js --live --threshold 0.9
 *   node scripts/ingest_instagram_posts.js --live --recheck        # re-scrape brands that already have posts
 *   node scripts/ingest_instagram_posts.js --live --max-profiles 100   # never scrape more than N profiles
 */

const { ApifyClient } = require("apify-client");
const { Pool } = require("pg");
const {
  S3Client,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");

// ── .env.local loader (same shape as the other scripts) ──────────────
const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)/);
    if (m) {
      const k = m[1].trim();
      const v = m[2].trim().replace(/^"|"$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

// ── options ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};

const LIVE = flag("--live");
const RECHECK = flag("--recheck");
const LIMIT = parseInt(opt("--limit", "0"), 10) || 0;
const BATCH = parseInt(opt("--batch", "50"), 10);
const CONCURRENCY = parseInt(opt("--concurrency", "6"), 10); // brands processed in parallel per batch
const THRESHOLD = parseFloat(opt("--threshold", "0.85"));
const MAX_PROFILES = parseInt(opt("--max-profiles", "0"), 10) || 0;
const POSTS_PER_PROFILE = parseInt(opt("--posts", "12"), 10);
const COST_PER_PROFILE = 0.0026; // free-plan PPR rate

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const S3_BUCKET = process.env.S3_BUCKET || "kikoai-wiki-web";
const S3_REGION = process.env.S3_REGION || "ap-northeast-2";
const S3_PUBLIC_BASE =
  process.env.S3_PUBLIC_BASE || `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`;

if (LIVE && !APIFY_TOKEN) {
  console.error("APIFY_TOKEN required (.env.local)");
  process.exit(1);
}

// ── SSRF-lite host allowlist (URLs come from Apify; only fetch IG/FB CDN) ─────
// NOTE: host-only check, no DNS resolution / rebind guard. Adequate for a LOCAL
// script whose URLs come from our own Apify run. Do NOT copy into a server
// endpoint — use lib/url-guard.ts assertSafeRemoteUrl (adds DNS-rebind defense).
function isAllowedImageHost(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false; // IG CDN is https-only
    const h = u.hostname.toLowerCase();
    return (
      h.endsWith(".cdninstagram.com") ||
      h.endsWith(".fbcdn.net") ||
      h === "cdninstagram.com" ||
      h === "fbcdn.net" ||
      h === "instagram.com" ||
      h.endsWith(".instagram.com")
    );
  } catch {
    return false;
  }
}

// ── post-image extraction (mirror of lib/instagram.ts) ───────────────
function postImageUrls(p) {
  const urls = [];
  const children = Array.isArray(p.childPosts) ? p.childPosts : [];
  for (const c of children) {
    const u = c.displayUrl || c.imageUrl;
    if (u) urls.push(u);
  }
  if (urls.length === 0 && Array.isArray(p.images)) {
    for (const u of p.images) if (typeof u === "string" && u) urls.push(u);
  }
  if (urls.length === 0) {
    const cover = p.displayUrl || p.thumbnailUrl || p.imageUrl;
    if (cover) urls.push(cover);
  }
  return [...new Set(urls)];
}

function extractPosts(profile, limit) {
  const raw = profile.latestPosts || profile.posts || [];
  const out = [];
  for (const p of raw.slice(0, limit)) {
    const shortcode = p.shortCode || p.shortcode;
    const imageUrls = postImageUrls(p);
    if (!shortcode || imageUrls.length === 0) continue;
    out.push({
      shortcode,
      postUrl: p.url || `https://www.instagram.com/p/${shortcode}/`,
      type: p.type || null,
      caption: typeof p.caption === "string" ? p.caption : null,
      imageUrls,
      likesCount: Number.isFinite(p.likesCount) ? p.likesCount : null,
      commentsCount: Number.isFinite(p.commentsCount) ? p.commentsCount : null,
      takenAt: p.timestamp || null,
      position: out.length,
    });
  }
  return out;
}

// ── S3 upload ─────────────────────────────────────────────────────────
const s3 = new S3Client({ region: S3_REGION });

async function uploadImagesToS3(remoteUrls, keyPrefix) {
  const results = await Promise.all(
    remoteUrls.map(async (url, i) => {
      try {
        if (!isAllowedImageHost(url)) return null;
        const res = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
        });
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get("content-type") || "image/jpeg";
        const ext = ct.includes("webp") ? "webp" : ct.includes("png") ? "png" : "jpg";
        const key = `${keyPrefix}-${i}.${ext}`;
        await s3.send(
          new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: buf,
            ContentType: ct.startsWith("image/") ? ct : "image/jpeg",
            CacheControl: "public, max-age=31536000, immutable",
          })
        );
        return `${S3_PUBLIC_BASE}/${key}`;
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

// ── bounded-concurrency pool ─────────────────────────────────────────
async function runPool(items, concurrency, worker) {
  let cursor = 0;
  async function next() {
    const i = cursor++;
    if (i >= items.length) return;
    await worker(items[i], i);
    return next();
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, next)
  );
}

// ── DB write: replace a brand's posts + update thumbnail/handle ──────
// Uses a dedicated pooled client so parallel brands don't interleave on one
// connection (a single pg connection cannot run concurrent transactions).
async function persistBrand(pool, brandId, username, profile, posts) {
  const coverThumbs = posts.map((p) => p.imageUrls[0]).filter(Boolean);
  let thumbnailUrl = posts[0]?.imageUrls[0] || null;
  if (!thumbnailUrl) {
    const pic = profile.profilePicUrlHD || profile.profilePicUrl;
    if (pic) {
      const s3pic = await uploadImagesToS3([pic], `feed/${brandId}/profile`);
      thumbnailUrl = s3pic[0] || null;
    }
  }

  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(`DELETE FROM brand_instagram_posts WHERE brand_id = $1`, [brandId]);
    for (const p of posts) {
      await db.query(
        `INSERT INTO brand_instagram_posts
           (brand_id, shortcode, post_url, type, caption, image_urls,
            likes_count, comments_count, taken_at, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          brandId,
          p.shortcode,
          p.postUrl,
          p.type,
          p.caption,
          p.imageUrls,
          p.likesCount,
          p.commentsCount,
          p.takenAt,
          p.position,
        ]
      );
    }
    await db.query(
      `UPDATE brand_nodes
       SET instagram_handle = $1,
           instagram_url    = $2,
           thumbnail_url    = $3,
           feed_thumbnails  = $4,
           updated_at       = now()
       WHERE id = $5`,
      [
        username,
        `https://www.instagram.com/${username}/`,
        thumbnailUrl,
        coverThumbs,
        brandId,
      ]
    );
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}

// ── main ──────────────────────────────────────────────────────────────
async function main() {
  console.log(
    `[config] live=${LIVE} limit=${LIMIT || "all"} batch=${BATCH} concurrency=${CONCURRENCY} threshold=${THRESHOLD} recheck=${RECHECK} maxProfiles=${MAX_PROFILES || "∞"}`
  );

  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }
  const url = new URL(raw);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("schema");
  const db = new Pool({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
    options: "-c search_path=wiki,public",
    max: Math.max(CONCURRENCY + 2, 8),
  });

  // Eligible brands: have a handle, status ok, confidence >= threshold,
  // highest confidence first (so a --limit test batch gets the best handles).
  const { rows: candidates } = await db.query(
    `SELECT wb.id::text AS id, wb.brand_name AS name, wb.instagram_handle AS handle,
            COALESCE((pb.wiki->'confidence_breakdown'->>'instagram_handle')::numeric, 0) AS conf,
            EXISTS(SELECT 1 FROM wiki.brand_instagram_posts p WHERE p.brand_id = wb.id) AS has_posts
     FROM wiki.brand_nodes wb
     JOIN public.brand_nodes pb ON pb.id = wb.id
     WHERE wb.instagram_handle IS NOT NULL
       AND pb.wiki->>'status' = 'ok'
       AND COALESCE((pb.wiki->'confidence_breakdown'->>'instagram_handle')::numeric, 0) >= $1
     ORDER BY conf DESC, wb.id ASC`,
    [THRESHOLD]
  );

  let targets = RECHECK ? candidates : candidates.filter((c) => !c.has_posts);
  const alreadyDone = candidates.length - targets.length;
  if (LIMIT) targets = targets.slice(0, LIMIT);
  if (MAX_PROFILES && targets.length > MAX_PROFILES) targets = targets.slice(0, MAX_PROFILES);

  console.log(`\n[eligibility]`);
  console.log(`  eligible (handle + ok + conf>=${THRESHOLD}): ${candidates.length}`);
  console.log(`  already have posts (skipped):                ${alreadyDone}${RECHECK ? " (ignored: --recheck)" : ""}`);
  console.log(`  → to scrape this run:                        ${targets.length}`);
  console.log(`  estimated Apify cost:                        $${(targets.length * COST_PER_PROFILE).toFixed(2)} (@ $${COST_PER_PROFILE}/profile)\n`);

  console.log("[sample 5]");
  targets.slice(0, 5).forEach((t) =>
    console.log(`  ${String(t.name).padEnd(30)} @${String(t.handle).padEnd(24)} conf=${t.conf}`)
  );
  console.log();

  if (!LIVE) {
    console.log("DRY-RUN. Re-run with --live to execute.");
    await db.end();
    return;
  }

  const apify = new ApifyClient({ token: APIFY_TOKEN });
  const byHandle = new Map(targets.map((t) => [String(t.handle).toLowerCase(), t]));

  let scrapedProfiles = 0;
  let okBrands = 0;
  let failBrands = 0;
  let totalImages = 0;
  const failures = [];

  // chunk targets into Apify runs of BATCH usernames each
  const chunks = [];
  for (let i = 0; i < targets.length; i += BATCH) chunks.push(targets.slice(i, i + BATCH));

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const usernames = chunk.map((t) => String(t.handle).toLowerCase());
    console.log(`[batch ${ci + 1}/${chunks.length}] scraping ${usernames.length} profiles…`);

    let items = [];
    try {
      const run = await apify.actor("apify/instagram-profile-scraper").call({ usernames });
      ({ items } = await apify.dataset(run.defaultDatasetId).listItems());
    } catch (e) {
      console.error(`  ✗ batch failed: ${e.message}`);
      chunk.forEach((t) => failures.push({ name: t.name, handle: t.handle, reason: `batch error: ${e.message}` }));
      failBrands += chunk.length;
      continue;
    }
    scrapedProfiles += items.length;

    // process this batch's brands in parallel (uploads dominate; brand-level
    // concurrency is the main speedup). Counters are mutated between awaits only,
    // safe under JS's single-threaded model.
    await runPool(items, CONCURRENCY, async (profile) => {
      const uname = (profile.username || "").toLowerCase();
      const t = byHandle.get(uname) || byHandle.get((profile.inputUrl || "").toLowerCase());
      if (!t) return;
      try {
        if (!profile.username) throw new Error("no profile");
        const scraped = extractPosts(profile, POSTS_PER_PROFILE);
        const posts = [];
        for (const p of scraped) {
          const imageUrls = await uploadImagesToS3(p.imageUrls, `feed/${t.id}/${p.shortcode}`);
          if (imageUrls.length) posts.push({ ...p, imageUrls, position: posts.length });
        }
        await persistBrand(db, t.id, profile.username, profile, posts);
        const imgs = posts.reduce((n, p) => n + p.imageUrls.length, 0);
        totalImages += imgs;
        okBrands++;
        console.log(`  ✓ ${String(t.name).padEnd(28)} @${uname.padEnd(22)} posts=${posts.length} imgs=${imgs}`);
      } catch (e) {
        failBrands++;
        failures.push({ name: t.name, handle: t.handle, reason: e.message });
        console.log(`  ✗ ${String(t.name).padEnd(28)} @${uname.padEnd(22)} ERROR: ${e.message}`);
      }
    });
  }

  await db.end();

  console.log(`\n[done] brands ok=${okBrands} fail=${failBrands} | profiles scraped=${scrapedProfiles} | images stored=${totalImages}`);
  console.log(`[cost] ~$${(scrapedProfiles * COST_PER_PROFILE).toFixed(2)}`);
  if (failures.length) {
    const fp = path.join(__dirname, "ingest_instagram_posts.failures.json");
    fs.writeFileSync(fp, JSON.stringify(failures, null, 2));
    console.log(`[failures] ${failures.length} → ${fp}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
