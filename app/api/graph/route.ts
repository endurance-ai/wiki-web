import { NextResponse } from "next/server";
import { getGraphData } from "@/lib/repositories/graph";
import { buildGraphData } from "@/lib/graph-utils";

export async function GET() {
  const { clusterNodes, brands, brandRelations, nodeRelations } =
    await getGraphData();

  const graph = buildGraphData(
    clusterNodes,
    brands,
    brandRelations,
    nodeRelations
  );

  return NextResponse.json(graph);
}
