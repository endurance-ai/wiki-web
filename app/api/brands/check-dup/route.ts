import { NextRequest, NextResponse } from "next/server";
import { checkDuplicate } from "@/lib/repositories/brands";

export async function POST(req: NextRequest) {
  const { name } = await req.json();
  const exists = await checkDuplicate(name);
  if (exists) {
    return NextResponse.json({ exists: true }, { status: 409 });
  }
  return NextResponse.json({ exists: false });
}
