import { z } from "zod";

// @MX:NOTE: [AUTO] central request-body schemas (SEC-04). Every mutating handler
//   validates its body with one of these via safeParse → 400 on failure, so malformed
//   input never reaches the pg repositories (guards against unhandled 500s and
//   storage-bomb payloads). Route [id] params are checked with isUuid().

// UUID check, still used for comment id route params (brand_comments.id is uuid).
const uuid = z.string().uuid();

export function isUuid(value: unknown): value is string {
  return uuid.safeParse(value).success;
}

// After the 002 realign, brand (brand_nodes) and style cluster (style_nodes) ids are
// bigint, serialized as numeric strings (e.g. "1843"). [id] route params for brands
// and the nodeId field must be validated as positive integer strings, NOT uuids.
// 양의 bigint 문자열만 (0 / 선행 0 / 19자리 초과 거부) → 거대 입력으로 인한 bigint overflow 500 방지.
const bigintId = z.string().regex(/^[1-9]\d{0,18}$/);

export function isBigintId(value: unknown): value is string {
  return bigintId.safeParse(value).success;
}

const keyword = z.string().trim().min(1).max(100);

// POST /api/brands
export const BrandCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  nodeId: bigintId,
  instagramHandle: z.string().trim().max(100).optional(),
  keywords: z.array(keyword).max(50).optional(),
});

// PUT /api/brands/[id] — partial update; all fields optional but typed when present.
export const BrandUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  nodeId: bigintId.optional(),
  instagramHandle: z.string().trim().max(100).nullable().optional(),
  keywords: z.array(keyword).max(50).optional(),
});

// POST /api/brands/[id]/comments
export const CommentCreateSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  authorName: z.string().trim().max(100).optional(),
});

// POST /api/brands/check-dup
export const CheckDupSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

// POST /api/brands/[id]/refresh-instagram
export const RefreshInstagramSchema = z.object({
  handle: z.string().trim().min(1).max(200),
});

/**
 * Only permit http/https hrefs. Rejects javascript:, data:, vbscript:, etc.
 * Returns the URL when safe, otherwise undefined (caller renders no link).
 *
 * @MX:NOTE: [AUTO] used in the brand UI for the (user-editable) instagramUrl —
 *   React escapes text but NOT href schemes, so a stored `javascript:` URL would
 *   execute on click (SEC-07). Keep all user-supplied hrefs behind this helper.
 */
export function safeHref(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  let url: URL;
  try {
    url = new URL(raw, "https://placeholder.invalid");
  } catch {
    return undefined;
  }
  if (url.protocol === "http:" || url.protocol === "https:") {
    return raw;
  }
  return undefined;
}
