#!/usr/bin/env node
/**
 * 브랜드 키워드 기반 유사도 계산 → brand_relations 채우기
 *
 * 알고리즘:
 *  - 각 키워드에 IDF 가중치 부여 (희귀 키워드일수록 더 강한 신호)
 *  - 두 브랜드 사이 가중 자카드 유사도 계산
 *  - 같은 노드(클러스터)에 속하면 추가 보너스
 *  - 임계값 이상만 brand_relations에 저장
 *
 * 사용법: node scripts/compute_relations.js [--dry-run] [--threshold 0.3]
 */

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)/);
    if (m) {
      const k = m[1].trim(), v = m[2].trim().replace(/^"|"$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const DRY_RUN = process.argv.includes("--dry-run");
const tIdx = process.argv.indexOf("--threshold");
const THRESHOLD = tIdx !== -1 ? parseFloat(process.argv[tIdx + 1]) : 0.3;
const SAME_NODE_BONUS = 0.15;  // 같은 클러스터면 +0.15
const MAX_PER_BRAND = 30;       // 브랜드당 최대 관계 수 (상위만)

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  // 모든 브랜드 + 키워드 + 노드 한 번에 로드
  const { rows: brands } = await db.query(`
    SELECT b.id, b.name, b.node_id,
           COALESCE(array_agg(k.keyword) FILTER (WHERE k.keyword IS NOT NULL), '{}') AS keywords
    FROM brands b
    LEFT JOIN brand_keywords k ON b.id = k.brand_id
    GROUP BY b.id, b.name, b.node_id
  `);
  console.log(`브랜드: ${brands.length}개`);

  // 키워드 빈도 카운트 → IDF 계산
  const kwCount = new Map();
  for (const b of brands) {
    for (const kw of b.keywords) kwCount.set(kw, (kwCount.get(kw) ?? 0) + 1);
  }
  const N = brands.length;
  const idf = new Map();
  for (const [kw, c] of kwCount) {
    idf.set(kw, Math.log(N / c));  // 흔한 키워드 → 낮은 가중치
  }

  console.log(`고유 키워드: ${kwCount.size}개`);
  console.log("IDF 샘플 (높을수록 희귀):");
  [...idf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([k, v]) => {
    console.log(`  ${k.padEnd(12)} ${v.toFixed(2)}`);
  });
  console.log("IDF 샘플 (낮을수록 흔함):");
  [...idf.entries()].sort((a, b) => a[1] - b[1]).slice(0, 5).forEach(([k, v]) => {
    console.log(`  ${k.padEnd(12)} ${v.toFixed(2)}`);
  });

  // 키워드 집합 미리 만들기 (Set으로)
  const brandSets = brands.map(b => ({
    id: b.id,
    name: b.name,
    nodeId: b.node_id,
    set: new Set(b.keywords),
  }));

  // 모든 쌍 유사도 계산
  console.log(`\n쌍별 유사도 계산 중... (총 ${(brands.length * (brands.length - 1) / 2).toLocaleString()}쌍)`);
  const relations = [];

  for (let i = 0; i < brandSets.length; i++) {
    const a = brandSets[i];
    if (a.set.size === 0) continue;

    for (let j = i + 1; j < brandSets.length; j++) {
      const b = brandSets[j];
      if (b.set.size === 0) continue;

      // 가중 자카드: 교집합 IDF 합 / 합집합 IDF 합
      let interW = 0, unionW = 0;
      const union = new Set([...a.set, ...b.set]);
      for (const kw of union) {
        const w = idf.get(kw) ?? 0;
        unionW += w;
        if (a.set.has(kw) && b.set.has(kw)) interW += w;
      }
      if (unionW === 0) continue;

      let sim = interW / unionW;

      // 같은 클러스터면 보너스
      if (a.nodeId && b.nodeId && a.nodeId === b.nodeId) {
        sim = Math.min(1.0, sim + SAME_NODE_BONUS);
      }

      if (sim >= THRESHOLD) {
        relations.push({ a: a.id, b: b.id, strength: sim, sameNode: a.nodeId === b.nodeId });
      }
    }
  }

  console.log(`임계값 ${THRESHOLD} 이상 관계: ${relations.length.toLocaleString()}개`);

  // 브랜드당 최대 N개로 자르기 (양방향)
  const byBrand = new Map();
  for (const r of relations) {
    if (!byBrand.has(r.a)) byBrand.set(r.a, []);
    if (!byBrand.has(r.b)) byBrand.set(r.b, []);
    byBrand.get(r.a).push(r);
    byBrand.get(r.b).push(r);
  }

  const kept = new Set();
  for (const [, list] of byBrand) {
    list.sort((x, y) => y.strength - x.strength);
    list.slice(0, MAX_PER_BRAND).forEach(r => kept.add(r));
  }
  const finalRelations = [...kept];
  console.log(`브랜드당 최대 ${MAX_PER_BRAND}개로 자른 후: ${finalRelations.length.toLocaleString()}개`);

  // 분포
  const distAll = finalRelations.map(r => r.strength).sort((a, b) => a - b);
  const p = (q) => distAll[Math.floor(distAll.length * q)]?.toFixed(3);
  console.log(`강도 분포 — p25:${p(0.25)}  p50:${p(0.5)}  p75:${p(0.75)}  p95:${p(0.95)}  max:${distAll[distAll.length-1]?.toFixed(3)}`);

  const sameNodeCount = finalRelations.filter(r => r.sameNode).length;
  console.log(`같은 노드 내 관계: ${sameNodeCount.toLocaleString()}개 / 다른 노드 간 관계: ${(finalRelations.length - sameNodeCount).toLocaleString()}개`);

  // 샘플 출력
  const idToName = new Map(brands.map(b => [b.id, b.name]));
  console.log("\n샘플 (강도 높은 순):");
  finalRelations
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 10)
    .forEach(r => {
      const tag = r.sameNode ? "[same]" : "[diff]";
      console.log(`  ${tag} ${idToName.get(r.a).padEnd(30)} ↔ ${idToName.get(r.b).padEnd(30)} ${r.strength.toFixed(3)}`);
    });

  if (DRY_RUN) {
    console.log("\n--dry-run: DB 저장 안 함");
    await db.end();
    return;
  }

  // DB에 저장
  console.log("\nbrand_relations 비우고 저장 중...");
  await db.query("DELETE FROM brand_relations");

  // 배치 insert
  const BATCH = 500;
  for (let i = 0; i < finalRelations.length; i += BATCH) {
    const batch = finalRelations.slice(i, i + BATCH);
    const values = batch.map((_, idx) =>
      `($${idx * 4 + 1}::uuid, $${idx * 4 + 2}::uuid, $${idx * 4 + 3}, $${idx * 4 + 4})`
    ).join(", ");
    const params = batch.flatMap(r => [r.a, r.b, r.strength, "keyword-similarity"]);
    await db.query(
      `INSERT INTO brand_relations (brand_id_a, brand_id_b, strength, relation_type) VALUES ${values}`,
      params
    );
    process.stdout.write(`\r  ${Math.min(i + BATCH, finalRelations.length)}/${finalRelations.length}`);
  }
  console.log("\n완료");

  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
