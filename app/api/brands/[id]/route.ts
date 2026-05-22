import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const brand = await prisma.brand.findUnique({
    where: { id },
    include: { node: true, keywords: true, comments: { orderBy: { createdAt: "desc" } } },
  });
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(brand);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { name, instagramHandle, nodeId, keywords } = body;

  if (name) {
    const conflict = await prisma.brand.findFirst({
      where: { name, NOT: { id } },
    });
    if (conflict) {
      return NextResponse.json({ error: "이미 등록된 브랜드명입니다" }, { status: 409 });
    }
  }

  // Replace keywords atomically
  const brand = await prisma.$transaction(async (tx) => {
    if (keywords !== undefined) {
      await tx.brandKeyword.deleteMany({ where: { brandId: id } });
      await tx.brandKeyword.createMany({
        data: keywords.map((k: string) => ({ brandId: id, keyword: k })),
      });
    }
    return tx.brand.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(instagramHandle !== undefined && { instagramHandle }),
        ...(nodeId !== undefined && { nodeId }),
      },
      include: { node: true, keywords: true },
    });
  });

  return NextResponse.json(brand);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.brand.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
