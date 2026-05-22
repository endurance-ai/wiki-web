import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildGraphData } from "@/lib/graph-utils";

export async function GET() {
  const [clusterNodes, brands, brandRelations, nodeRelations] =
    await Promise.all([
      prisma.brandNode.findMany(),
      prisma.brand.findMany({ include: { node: true } }),
      prisma.brandRelation.findMany(),
      prisma.nodeRelation.findMany(),
    ]);

  const graph = buildGraphData(
    clusterNodes,
    brands,
    brandRelations,
    nodeRelations
  );

  return NextResponse.json(graph);
}
