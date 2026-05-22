import { NextResponse } from "next/server";

// @MX:ANCHOR: [AUTO] Single gate for every mutating API endpoint during the view-only phase.
// @MX:REASON: The participatory editing feature (auth + participation) is not built yet. Until
// WIKI_WRITE_ENABLED === "true", all create/update/delete handlers must return 403 while their
// logic stays intact. Every mutation route calls this as its first statement, so this is the one
// place that flips writes on/off when auth lands later.
export function writesDisabled(): NextResponse | null {
  if (process.env.WIKI_WRITE_ENABLED === "true") {
    return null;
  }
  return NextResponse.json(
    { error: "편집 기능은 아직 제공되지 않습니다" },
    { status: 403 }
  );
}
