#!/usr/bin/env node
/**
 * E 노드 축 정의 + 브랜드 좌표 시드.
 *
 *   축 X (-1 ~ +1): 웨어러블 ↔ 컨셉추얼
 *   축 Y (-1 ~ +1): 테크니컬/스포츠 ↔ 해체/테일러링
 *
 * 좌표는 모델이 브랜드 정체성을 기반으로 추정한 초깃값. 사용자가 모달에서 수정 가능.
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

// [브랜드명, x (-웨어러블 ~ +컨셉추얼), y (-테크니컬 ~ +해체/테일러링)]
const SEED = [
  ["_J.L - A.L_",                          0.6,   0.3],
  ["1017 ALYX 9SM",                       -0.1,  -0.8],
  ["11 by Boris Bidjan Saberi",            0.7,   0.5],
  ["132 5. ISSEY MIYAKE",                  0.3,  -0.3],
  ["A DICIANNOVEVENTITRE",                 0.9,   0.4],
  ["AIREI",                                0.5,   0.1],
  ["ATTACHMENT",                          -0.4,   0.3],
  ["Bao Bao Issey Miyake",                -0.6,  -0.2],
  ["BYBORRE",                              0.0,  -0.6],
  ["Camiel Fortgens",                      0.5,   0.4],
  ["CAMPERLAB",                           -0.7,  -0.4],
  ["Charlie Constantinou",                 0.3,   0.0],
  ["Comme des Garçons",                    0.85,  0.5],
  ["Comme des Garçons Comme des Garçons",  0.7,   0.6],
  ["Comme des Garçons Homme Plus",         0.8,   0.7],
  ["Craig Green",                          0.7,   0.2],
  ["DEVOA",                                0.4,   0.0],
  ["Dingyun Zhang",                        0.5,   0.2],
  ["Dion Lee",                            -0.2,   0.1],
  ["doublet",                             -0.3,   0.4],
  ["Duran Lantink",                        0.4,  -0.2],
  ["Factor's",                             0.2,   0.0],
  ["Feng Chen Wang",                       0.4,   0.3],
  ["FFFPOSTALSERVICE",                     0.5,   0.1],
  ["HELIOT EMIL",                          0.2,  -0.7],
  ["HODAKOVA",                             0.6,   0.5],
  ["Homme Plissé Issey Miyake",           -0.1,  -0.1],
  ["Innerraum",                            0.3,  -0.5],
  ["Issuethings",                          0.3,  -0.2],
  ["Jean Paul Gaultier",                   0.4,   0.7],
  ["Junya Watanabe",                       0.75,  0.55],
  ["Kanghyuk",                             0.4,  -0.3],
  ["Kiko Kostadinov",                      0.55,  0.0],
  ["Maison Margiela",                      0.9,   0.7],
  ["Marine Serre",                        -0.4,  -0.5],
  ["Moncler Genius",                      -0.7,  -0.5],
  ["Namacheko",                            0.4,   0.6],
  ["NEMEN®",                              -0.5,  -0.6],
  ["Noir Kei Ninomiya",                    0.6,   0.5],
  ["Olly Shinder",                         0.2,  -0.3],
  ["Omar Afridi",                          0.4,   0.2],
  ["Ottolinger",                           0.3,   0.55],
  ["Post Archive Faction (PAF)",           0.1,  -0.8],
  ["Prototypes",                           0.3,  -0.2],
  ["Rokh",                                 0.1,   0.6],
  ["Sulvam",                               0.5,   0.5],
  ["TAAKK",                                0.4,   0.1],
  ["Uncertain Factor",                     0.4,  -0.1],
  ["VEIN",                                 0.3,  -0.2],
  ["VITELLI",                              0.0,   0.3],
];

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  // 1) 노드 축 컬럼 추가 (이미 있으면 무시)
  await db.query(`
    ALTER TABLE brand_nodes
    ADD COLUMN IF NOT EXISTS axis_x_label VARCHAR(100),
    ADD COLUMN IF NOT EXISTS axis_y_label VARCHAR(100)
  `);

  // 2) E 노드 축 라벨 세팅
  await db.query(`
    UPDATE brand_nodes
    SET axis_x_label = '웨어러블 ↔ 컨셉추얼',
        axis_y_label = '테크니컬 ↔ 해체/테일러링'
    WHERE name LIKE 'E%'
  `);
  console.log("E 노드 축 라벨 저장 완료");

  // 3) 좌표 채우기
  let updated = 0, skipped = 0;
  for (const [name, x, y] of SEED) {
    const r = await db.query(
      `UPDATE brands SET x_position=$1, y_position=$2 WHERE name=$3`,
      [x, y, name]
    );
    if (r.rowCount) {
      updated++;
    } else {
      console.log("  미발견:", name);
      skipped++;
    }
  }
  console.log(`좌표 업데이트: ${updated}개, 미발견: ${skipped}개`);

  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
