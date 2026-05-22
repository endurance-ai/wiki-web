import { NextRequest, NextResponse } from "next/server";
import { deleteComment } from "@/lib/repositories/comments";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteComment(id);
  return NextResponse.json({ success: true });
}
