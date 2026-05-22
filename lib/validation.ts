import { z } from "zod";

// @MX:NOTE: [AUTO] central request-body schemas (SEC-04). Every mutating handler
//   validates its body with one of these via safeParse → 400 on failure, so malformed
//   input never reaches the pg repositories (guards against unhandled 500s and
//   storage-bomb payloads). Route [id] params are checked with isUuid().

// UUID v-agnostic check used for [id] route params (brand id, comment id, nodeId).
const uuid = z.string().uuid();

export function isUuid(value: unknown): value is string {
  return uuid.safeParse(value).success;
}

const keyword = z.string().trim().min(1).max(100);

// POST /api/brands
export const BrandCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  nodeId: z.string().uuid(),
  instagramHandle: z.string().trim().max(100).optional(),
  keywords: z.array(keyword).max(50).optional(),
});

// PUT /api/brands/[id] — partial update; all fields optional but typed when present.
export const BrandUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  nodeId: z.string().uuid().optional(),
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
