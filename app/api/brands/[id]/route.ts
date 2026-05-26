import { NextRequest, NextResponse } from "next/server";
import {
  getBrandById,
  updateBrand,
  deleteBrand,
  checkDuplicateExcept,
} from "@/lib/repositories/brands";
import { getBrandPosts } from "@/lib/repositories/posts";
import { BrandUpdateSchema, isBigintId } from "@/lib/validation";
import { writesDisabled } from "@/lib/write-guard";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isBigintId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [brand, posts] = await Promise.all([getBrandById(id), getBrandPosts(id)]);
  if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...brand, posts });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = writesDisabled(); if (blocked) return blocked;

  const { id } = await params;
  if (!isBigintId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = BrandUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { name, instagramHandle, nodeId, keywords } = parsed.data;

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
  const blocked = writesDisabled(); if (blocked) return blocked;

  const { id } = await params;
  if (!isBigintId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteBrand(id);
  return NextResponse.json({ success: true });
}
