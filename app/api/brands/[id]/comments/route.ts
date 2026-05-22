import { NextRequest, NextResponse } from "next/server";
import { listComments, createComment } from "@/lib/repositories/comments";
import { CommentCreateSchema, isBigintId } from "@/lib/validation";
import { writesDisabled } from "@/lib/write-guard";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isBigintId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const comments = await listComments(id);
  return NextResponse.json(comments);
}

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

  const parsed = CommentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { content, authorName } = parsed.data;

  const comment = await createComment(id, { content, authorName });

  return NextResponse.json(comment, { status: 201 });
}
