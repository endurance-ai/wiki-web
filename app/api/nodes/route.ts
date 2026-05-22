import { NextResponse } from "next/server";
import { listNodes } from "@/lib/repositories/nodes";

export async function GET() {
  const nodes = await listNodes();
  return NextResponse.json(nodes);
}
