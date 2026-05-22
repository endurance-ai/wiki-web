import { NextRequest, NextResponse } from "next/server";
import { createBrand, listBrands, checkDuplicate } from "@/lib/repositories/brands";

export async function GET() {
  const brands = await listBrands();
  return NextResponse.json(brands);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, instagramHandle, nodeId, keywords } = body;

  if (!name || !nodeId) {
    return NextResponse.json({ error: "name and nodeId are required" }, { status: 400 });
  }

  const exists = await checkDuplicate(name);
  if (exists) {
    return NextResponse.json({ error: "이미 등록된 브랜드입니다" }, { status: 409 });
  }

  const brand = await createBrand({ name, instagramHandle, nodeId, keywords });

  return NextResponse.json(brand, { status: 201 });
}
