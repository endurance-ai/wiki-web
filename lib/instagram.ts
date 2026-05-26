// Pure extraction helpers for the Apify instagram-profile-scraper output shape.
// Verified against apify/instagram-profile-scraper (2026-05-25): a profile returns
// `latestPosts` (up to 12), each post is Image | Sidecar | Video. Sidecar (carousel)
// posts carry their children in BOTH `childPosts[].displayUrl` and `images[]` (same
// URLs); single-image posts only have `displayUrl`. We capture ALL images per post —
// Apify charges per profile, not per image, so there is no cost to keeping them all.

export interface ScrapedPost {
  shortcode: string;
  postUrl: string | null;
  type: string | null;
  caption: string | null;
  imageUrls: string[]; // remote IG CDN urls, cover first
  likesCount: number | null;
  commentsCount: number | null;
  takenAt: string | null; // ISO timestamp
  position: number; // 0-based recency order within the scraped batch
}

type RawPost = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** All image URLs for one post: carousel children first, else the single cover. */
function postImageUrls(p: RawPost): string[] {
  const urls: string[] = [];
  const children = Array.isArray(p.childPosts) ? p.childPosts : [];
  for (const c of children as RawPost[]) {
    const u = str(c.displayUrl) || str(c.imageUrl);
    if (u) urls.push(u);
  }
  if (urls.length === 0 && Array.isArray(p.images)) {
    for (const u of p.images as unknown[]) {
      const s = str(u);
      if (s) urls.push(s);
    }
  }
  if (urls.length === 0) {
    const cover = str(p.displayUrl) || str(p.thumbnailUrl) || str(p.imageUrl);
    if (cover) urls.push(cover);
  }
  // de-dupe while preserving order
  return [...new Set(urls)];
}

/**
 * Turn a scraped profile into ordered post records (videos with no image are dropped).
 * `limit` caps the number of posts (default 12 = the scraper's default page).
 */
export function extractPosts(
  profile: Record<string, unknown>,
  limit = 12
): ScrapedPost[] {
  const raw = (profile.latestPosts || profile.posts || []) as RawPost[];
  const out: ScrapedPost[] = [];
  for (const p of raw.slice(0, limit)) {
    const shortcode = str(p.shortCode) || str(p.shortcode);
    const imageUrls = postImageUrls(p);
    if (!shortcode || imageUrls.length === 0) continue;
    out.push({
      shortcode,
      postUrl: str(p.url) || `https://www.instagram.com/p/${shortcode}/`,
      type: str(p.type),
      caption: str(p.caption),
      imageUrls,
      likesCount: num(p.likesCount),
      commentsCount: num(p.commentsCount),
      takenAt: str(p.timestamp),
      position: out.length,
    });
  }
  return out;
}
