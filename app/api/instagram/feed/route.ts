import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get("handle");
  if (!handle) {
    return NextResponse.json({ error: "handle required" }, { status: 400 });
  }

  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ feed: [] });

  try {
    const res = await fetch(
      `https://graph.instagram.com/me/media?fields=id,caption,media_url,thumbnail_url,media_type,timestamp&access_token=${token}`
    );
    if (!res.ok) return NextResponse.json({ feed: [] });
    const data = await res.json();
    return NextResponse.json({ feed: (data.data ?? []).slice(0, 9) });
  } catch {
    return NextResponse.json({ feed: [] });
  }
}
