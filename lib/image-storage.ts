import { promises as fs } from "fs";
import path from "path";
import { assertSafeRemoteUrl } from "@/lib/url-guard";

const FEED_DIR = path.join(process.cwd(), "public", "feed-images");

/**
 * 브랜드명 → URL-safe 슬러그
 * "Comme des Garçons Homme Plus" → "comme-des-garcons-homme-plus"
 * "032C" → "032c"
 * "_J.L - A.L_" → "j-l-a-l"
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")  // 악센트 제거 (ç → c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * URL에서 이미지를 다운로드해서 public/feed-images/{slug}/{index}.jpg 로 저장.
 * 저장 경로(웹 URL)를 반환.
 */
async function downloadImage(url: string, slug: string, index: number): Promise<string | null> {
  try {
    // SSRF guard (SEC-02): even though these URLs come from the Apify Instagram
    // scraper, treat them as untrusted and only fetch allowlisted CDN hosts.
    const guard = await assertSafeRemoteUrl(url);
    if (!guard.ok) return null;

    const res = await fetch(guard.url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
      redirect: "manual",
    });
    if (!res.ok) return null;

    const buf = Buffer.from(await res.arrayBuffer());

    const brandDir = path.join(FEED_DIR, slug);
    await fs.mkdir(brandDir, { recursive: true });

    // jpg/webp/png 확장자 판별
    const ct = res.headers.get("content-type") || "";
    const ext = ct.includes("webp") ? "webp" : ct.includes("png") ? "png" : "jpg";

    const filename = `${index}.${ext}`;
    await fs.writeFile(path.join(brandDir, filename), buf);

    return `/feed-images/${slug}/${filename}`;
  } catch {
    return null;
  }
}

/**
 * 여러 URL을 병렬로 다운로드. 실패한 항목은 빼고 성공한 로컬 경로만 반환.
 */
export async function downloadFeedImages(
  urls: string[],
  brandName: string
): Promise<{ slug: string; localUrls: string[] }> {
  const slug = slugify(brandName);

  // 기존 폴더 비우기 (피드 갱신 시 묵은 이미지 정리)
  try {
    await fs.rm(path.join(FEED_DIR, slug), { recursive: true, force: true });
  } catch { /* ignore */ }

  const results = await Promise.all(
    urls.slice(0, 9).map((url, i) => downloadImage(url, slug, i))
  );

  return {
    slug,
    localUrls: results.filter((u): u is string => !!u),
  };
}
