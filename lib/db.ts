import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaClient() {
  const raw = process.env.DATABASE_URL!;
  // Prisma 런타임(driver adapter)은 URL의 ?schema= 를 자동 적용하지 않으므로 어댑터 옵션으로 전달.
  const schema = new URL(raw).searchParams.get("schema") ?? undefined;
  // 최신 node-pg는 sslmode=require 를 verify-full 로 해석 → dev-app self-signed 인증서를 거부.
  // sslmode 파라미터를 떼고 ssl 검증을 끈 상태로 직접 지정한다.
  const connectionString = raw.replace(/([?&])sslmode=[^&]*/i, "$1").replace(/[?&]$/, "");
  const adapter = new PrismaPg(
    { connectionString, ssl: { rejectUnauthorized: false } },
    schema ? { schema } : undefined
  );
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
