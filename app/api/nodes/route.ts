import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const nodes = await prisma.brandNode.findMany({
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(nodes);
}
