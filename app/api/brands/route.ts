import { NextRequest, NextResponse } from "next/server";
import { createBrand, listBrands, checkDuplicate } from "@/lib/repositories/brands";
import { BrandCreateSchema } from "@/lib/validation";

export async function GET() {
  const brands = await listBrands();
  return NextResponse.json(brands);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = BrandCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { name, instagramHandle, nodeId, keywords } = parsed.data;

  const exists = await checkDuplicate(name);
  if (exists) {
    return NextResponse.json({ error: "이미 등록된 브랜드입니다" }, { status: 409 });
  }

  const brand = await createBrand({ name, instagramHandle, nodeId, keywords });

  return NextResponse.json(brand, { status: 201 });
}
