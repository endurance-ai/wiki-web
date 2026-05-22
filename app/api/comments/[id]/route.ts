import { NextRequest, NextResponse } from "next/server";
import { deleteComment } from "@/lib/repositories/comments";
import { isUuid } from "@/lib/validation";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteComment(id);
  return NextResponse.json({ success: true });
}
