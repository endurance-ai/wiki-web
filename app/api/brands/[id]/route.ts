import { NextRequest, NextResponse } from "next/server";
import {
  getBrandById,
  updateBrand,
  deleteBrand,
  checkDuplicateExcept,
} from "@/lib/repositories/brands";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const brand = await getBrandById(id);
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
    const conflict = await checkDuplicateExcept(name, id);
    if (conflict) {
      return NextResponse.json({ error: "이미 등록된 브랜드명입니다" }, { status: 409 });
    }
  }

  // Replace keywords atomically (handled inside the repository transaction).
  const brand = await updateBrand(id, { name, instagramHandle, nodeId, keywords });

  return NextResponse.json(brand);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteBrand(id);
  return NextResponse.json({ success: true });
}
