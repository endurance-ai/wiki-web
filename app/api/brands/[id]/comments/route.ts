import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const comments = await prisma.brandComment.findMany({
    where: { brandId: id },
    orderBy: { createdAt: "desc" },
  });
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

  const comment = await prisma.brandComment.create({
    data: { brandId: id, content, authorName },
  });

  return NextResponse.json(comment, { status: 201 });
}
