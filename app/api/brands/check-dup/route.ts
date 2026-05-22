import { NextRequest, NextResponse } from "next/server";
import { checkDuplicate } from "@/lib/repositories/brands";
import { CheckDupSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = CheckDupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const exists = await checkDuplicate(parsed.data.name);
  if (exists) {
    return NextResponse.json({ exists: true }, { status: 409 });
  }
  return NextResponse.json({ exists: false });
}
