import { NextRequest, NextResponse } from "next/server";
import { ApifyClient } from "apify-client";
import { findBrandNameForSlug, updateBrandInstagram } from "@/lib/repositories/brands";
import { replaceBrandPosts } from "@/lib/repositories/posts";
import { uploadRemoteImagesToS3 } from "@/lib/image-storage";
import { extractPosts } from "@/lib/instagram";
import { RefreshInstagramSchema, isBigintId } from "@/lib/validation";
import { writesDisabled } from "@/lib/write-guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = writesDisabled(); if (blocked) return blocked;

  const { id } = await params;
  if (!isBigintId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = RefreshInstagramSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { handle } = parsed.data;

  // URL이면 핸들 추출 (https://www.instagram.com/alyxstudio/ → alyxstudio)
  let cleanHandle = handle.trim();
  const urlMatch = cleanHandle.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
  if (urlMatch) cleanHandle = urlMatch[1];
  cleanHandle = cleanHandle.replace(/^@/, "").replace(/\/$/, "").toLowerCase();

  if (!/^[a-zA-Z0-9._]+$/.test(cleanHandle)) {
    return NextResponse.json({ error: "invalid handle format" }, { status: 400 });
  }

  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "APIFY_TOKEN not configured" }, { status: 500 });
  }

  // 브랜드 존재 확인 (S3 키 prefix 는 안정적인 brand id 사용)
  const brandName = await findBrandNameForSlug(id);
  if (!brandName) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const apify = new ApifyClient({ token });

  try {
    const run = await apify.actor("apify/instagram-profile-scraper").call({
      usernames: [cleanHandle],
    });
    const { items } = await apify.dataset(run.defaultDatasetId).listItems();
    const profile = items[0];

    if (!profile || !profile.username) {
      return NextResponse.json({ error: "프로필을 찾을 수 없습니다" }, { status: 404 });
    }

    // 12개 글 × 전체 캐러셀 이미지를 추출 → 각 글 이미지를 S3 로 영구 저장.
    // 인스타 CDN URL 은 24~48h 만료라 즉시 복사해 둔다. S3 키: feed/{brandId}/{shortcode}.
    const scraped = extractPosts(profile, 12);
    const posts = await Promise.all(
      scraped.map(async (p) => {
        const imageUrls = await uploadRemoteImagesToS3(
          p.imageUrls,
          `feed/${id}/${p.shortcode}`
        );
        return { ...p, imageUrls };
      })
    );
    // 이미지가 한 장도 안 올라간 글은 제외하고 position 재정렬.
    const kept = posts
      .filter((p) => p.imageUrls.length > 0)
      .map((p, i) => ({ ...p, position: i }));

    await replaceBrandPosts(id, kept);

    // 커버 썸네일 = 첫 글 첫 이미지. 피드가 비면 프로필 사진을 S3 에 올려 폴백.
    let thumbnailUrl: string | null = kept[0]?.imageUrls[0] ?? null;
    if (!thumbnailUrl) {
      const profilePic = (profile.profilePicUrlHD || profile.profilePicUrl) as
        | string
        | undefined;
      if (profilePic) {
        const profileS3 = await uploadRemoteImagesToS3(
          [profilePic],
          `feed/${id}/profile`
        );
        thumbnailUrl = profileS3[0] ?? null;
      }
    }

    // feed_thumbnails 는 호환용으로 각 글의 커버(첫 이미지) 목록을 유지.
    const coverThumbnails = kept.map((p) => p.imageUrls[0]).filter(Boolean);

    const updated = await updateBrandInstagram(id, {
      instagramHandle: profile.username as string,
      instagramUrl: `https://www.instagram.com/${profile.username}/`,
      thumbnailUrl,
      feedThumbnails: coverThumbnails,
    });

    return NextResponse.json({
      brand: updated,
      meta: {
        followers: profile.followersCount,
        postCount: kept.length,
        imageCount: kept.reduce((n, p) => n + p.imageUrls.length, 0),
      },
    });
  } catch (e) {
    // SEC-09: never leak raw upstream (Apify) error text to clients — it can
    // expose internal structure / token state. Log server-side, return generic.
    console.error("[refresh-instagram] Apify error:", e);
    return NextResponse.json(
      { error: "Instagram 갱신에 실패했습니다" },
      { status: 502 }
    );
  }
}
