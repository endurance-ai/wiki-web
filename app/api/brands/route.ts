import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const brands = await prisma.brand.findMany({
    include: { node: true, keywords: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(brands);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, instagramHandle, nodeId, keywords } = body;

  if (!name || !nodeId) {
    return NextResponse.json({ error: "name and nodeId are required" }, { status: 400 });
  }

  const existing = await prisma.brand.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: "이미 등록된 브랜드입니다" }, { status: 409 });
  }

  const brand = await prisma.brand.create({
    data: {
      name,
      instagramHandle,
      nodeId,
      keywords: {
        create: (keywords ?? []).map((k: string) => ({ keyword: k })),
      },
    },
    include: { keywords: true, node: true },
  });

  return NextResponse.json(brand, { status: 201 });
}
