import "server-only";
import { readFileSync } from "fs";
import { Pool } from "pg";
import type { PoolConfig } from "pg";

declare global {
  var __pgPool: Pool | undefined;
}

const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

// @MX:ANCHOR: [AUTO] single shared pg Pool for all wiki-schema repositories
// @MX:REASON: every repository module imports this pool; a second pool would
//   double connection count against dev-app Postgres and break the global singleton.
function createPool(): Pool {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    if (isBuildPhase) {
      return new Pool({ connectionString: "postgresql://build:build@localhost:5432/build" });
    }
    throw new Error("Missing environment variable: DATABASE_URL");
  }

  // pg v8.16+ 가 connection string 의 `sslmode=require` 를 verify-full 로 격상.
  // dev-app Postgres 는 self-signed cert 라 verify-full 통과 못 함.
  // → connection string 에서 sslmode 파라미터를 분리하고, ssl 옵션을 명시적으로 우리가 제어.
  const url = new URL(raw);
  const sslmode = url.searchParams.get("sslmode");
  url.searchParams.delete("sslmode");
  // Prisma 시절 URL 에 남아 있던 `schema=wiki` 도 제거 (pg 는 무시하지만 깔끔하게).
  url.searchParams.delete("schema");
  const cleaned = url.toString();

  // SSL posture (SEC-06):
  //  - sslmode=disable  → plaintext (explicit opt-out only).
  //  - DATABASE_CA_CERT set → trust ONLY that CA and verify the cert. This is the
  //    secure path: distribute the dev-app self-signed CA as a file and point this
  //    env var at it to get full verification without disabling it globally.
  //  - otherwise → fall back to the ACCEPTED DEV POSTURE: SSL on but
  //    rejectUnauthorized:false. This matches the team's `app` repo so the existing
  //    dev-app self-signed connection keeps working. NOT for production — promote to
  //    a real CA + rejectUnauthorized:true before going to prod.
  let ssl: PoolConfig["ssl"];
  const caPath = process.env.DATABASE_CA_CERT;
  if (sslmode === "disable") {
    ssl = false;
  } else if (caPath) {
    ssl = { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true };
  } else {
    ssl = { rejectUnauthorized: false };
  }

  // 모든 테이블은 wiki 스키마에 있음 → 미수식 테이블명이 wiki 로 resolve 되도록 search_path 고정.
  return new Pool({
    connectionString: cleaned,
    ssl,
    max: 10,
    options: "-c search_path=wiki",
  });
}

export const pool: Pool = globalThis.__pgPool ?? createPool();
if (process.env.NODE_ENV !== "production" && !isBuildPhase) {
  globalThis.__pgPool = pool;
}

// idle client 에러는 uncaughtException 으로 프로세스 종료할 수 있음 (pg 공식 권고)
pool.on("error", (err) => {
  console.error("[database] idle client error", err);
});
