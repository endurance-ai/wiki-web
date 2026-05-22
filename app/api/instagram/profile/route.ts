import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get("handle");
  if (!handle) {
    return NextResponse.json({ error: "handle required" }, { status: 400 });
  }

  // oEmbed fallback — no auth required, returns thumbnail
  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/instagram_oembed?url=https://www.instagram.com/${handle}/&access_token=${process.env.INSTAGRAM_APP_ID}|${process.env.INSTAGRAM_APP_SECRET}`
    );
    if (!res.ok) return NextResponse.json({ thumbnailUrl: null });
    const data = await res.json();
    return NextResponse.json({ thumbnailUrl: data.thumbnail_url ?? null });
  } catch {
    return NextResponse.json({ thumbnailUrl: null });
  }
}
