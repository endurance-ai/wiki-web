import { NextRequest, NextResponse } from "next/server";
import { listComments, createComment } from "@/lib/repositories/comments";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const comments = await listComments(id);
  return NextResponse.json(comments);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { content, authorName } = await req.json();

  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const comment = await createComment(id, { content, authorName });

  return NextResponse.json(comment, { status: 201 });
}
