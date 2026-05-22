const BASE_URL = "https://graph.instagram.com";

export async function getInstagramProfile(handle: string) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return null;

  try {
    // Search user by username via Graph API
    const res = await fetch(
      `${BASE_URL}/v18.0/ig_hashtag_search?q=${handle}&access_token=${token}`
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getInstagramFeed(userId: string) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return [];

  try {
    const res = await fetch(
      `${BASE_URL}/${userId}/media?fields=id,caption,media_url,thumbnail_url,media_type,timestamp&access_token=${token}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.data ?? [];
  } catch {
    return [];
  }
}
