import { NextRequest, NextResponse } from "next/server";
import { ApifyClient } from "apify-client";
import { findBrandNameForSlug, updateBrandInstagram } from "@/lib/repositories/brands";
import { downloadFeedImages } from "@/lib/image-storage";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { handle } = await req.json();

  if (!handle || typeof handle !== "string") {
    return NextResponse.json({ error: "handle required" }, { status: 400 });
  }

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

  // 브랜드 이름 (다운로드 폴더 슬러그용)
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

    const posts = (profile.latestPosts || profile.posts || []) as Array<Record<string, unknown>>;
    const remoteUrls = posts
      .slice(0, 9)
      .map(p => (p.displayUrl || p.thumbnailUrl || p.imageUrl) as string | undefined)
      .filter((u): u is string => !!u);

    // 인스타 CDN URL은 24~48시간 후 만료 → 즉시 로컬 다운로드해서 영구 보관
    const { localUrls } = await downloadFeedImages(remoteUrls, brandName);

    // 피드가 비어 있으면 프로필 사진을 썸네일로 폴백 (이것도 로컬 저장)
    let thumbnailUrl: string | null = localUrls[0] ?? null;
    if (!thumbnailUrl) {
      const profilePic = (profile.profilePicUrlHD || profile.profilePicUrl) as string | undefined;
      if (profilePic) {
        const { localUrls: profileLocal } = await downloadFeedImages([profilePic], brandName);
        thumbnailUrl = profileLocal[0] ?? null;
      }
    }

    const updated = await updateBrandInstagram(id, {
      instagramHandle: profile.username as string,
      instagramUrl: `https://www.instagram.com/${profile.username}/`,
      thumbnailUrl,
      feedThumbnails: localUrls,
    });

    return NextResponse.json({
      brand: updated,
      meta: {
        followers: profile.followersCount,
        feedCount: localUrls.length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: `Apify 오류: ${msg}` }, { status: 502 });
  }
}
