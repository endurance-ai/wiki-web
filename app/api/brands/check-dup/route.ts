import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  const existing = await prisma.brand.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ exists: true }, { status: 409 });
  }
  return NextResponse.json({ exists: false });
}
