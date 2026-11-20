#!/usr/bin/env node
/**
 * job_apps v2 迁移：把「靠备注和人的记忆」的东西变成字段。
 *
 *   node scripts/migrate_jobs_v2.js --dry-run   # 只打印将要改什么
 *   node scripts/migrate_jobs_v2.js             # 真跑（自动备份到 data/backups/）
 *
 * 纪律：
 *   - 幂等：_migrated === "v2" 的行直接跳过，重复跑不会二次搬运。
 *   - 不删行、不清空 applied_date、不碰 updated_at（否则周报「最近更新」全乱）。
 *   - 猜不出来的字段留空，不编。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const DRY = process.argv.includes("--dry-run");
const VERSION = "v2";

const DEFAULT_BIG = [
  "字节跳动", "快手", "小红书", "百度", "腾讯", "阿里", "拼多多", "京东",
  "得物", "哔哩哔哩", "网易", "滴滴", "美团", "蚂蚁", "华为",
];
const TIERS = ["冲刺", "主力", "保底"];
const CITY_CANDIDATES = ["北京", "天津", "上海"];
// 只做语义等价的归一，猜不准的脏值原样保留
const STATUS_ALIAS = {
  终止: "已取消",
  挂了: "已取消",
  已挂: "已取消",
  放弃: "已取消",
  结束: "已取消",
  待投: "待投递",
  未投: "待投递",
  已投: "简历筛选中",
  已投递: "简历筛选中",
};

function readDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDB(db) {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backup = path.join(BACKUP_DIR, `db.before-${VERSION}-${stamp}.json`);
  fs.copyFileSync(DB_FILE, backup);
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
  return backup;
}

function parseCity(location) {
  const raw = String(location || "");
  const hits = CITY_CANDIDATES.filter((c) => raw.includes(c));
  const multi = hits.length > 1 || /[/、,，]/.test(raw);
  if (!hits.length) return { city: "", multi };
  return { city: hits[0], multi };
}

function parseBatchDate(batch, createdAt) {
  const m = String(batch || "").match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`;
  }
  const d = String(createdAt || "");
  return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : "";
}

function main() {
  if (!fs.existsSync(DB_FILE)) {
    console.error(`找不到数据文件：${DB_FILE}`);
    process.exit(1);
  }
  const db = readDB();
  const jobs = Array.isArray(db.job_apps) ? db.job_apps : [];
  const resumeIds = new Set((db.resumes || []).map((r) => Number(r.id)));

  // 大厂名单以 settings.job_policy 为准，没有就用内置默认
  let bigCompanies = DEFAULT_BIG;
  const policyRow = (db.settings || []).find((s) => s.key === "job_policy");
  if (policyRow?.value) {
    try {
      const p = JSON.parse(policyRow.value);
      if (Array.isArray(p.big_companies) && p.big_companies.length) bigCompanies = p.big_companies;
    } catch {
      /* 配置坏了就用默认 */
    }
  }

  const stats = {
    scanned: 0,
    skipped: 0,
    changed: 0,
    city: 0,
    city_multi: 0,
    company_type: 0,
    source: 0,
    batch_date: 0,
    batch: 0,
    resume_id: 0,
    status_changed_at: 0,
  };
  const dangling = [];
  const tierToSource = [];
  const statusNormalized = [];

  jobs.forEach((j) => {
    stats.scanned += 1;
    if (j._migrated === VERSION) {
      stats.skipped += 1;
      return;
    }
    const before = JSON.stringify(j);
    const set = (key, val) => {
      if (j[key] === val) return;
      if (j[key] === undefined || j[key] === "" || j[key] === null) stats[key] = (stats[key] || 0) + 1;
      j[key] = val;
    };

    // 1. 城市
    const { city, multi } = parseCity(j.location);
    set("city", city || "其他");
    if (multi) set("city_multi", "1");

    // 2. 公司类型
    const isBig = bigCompanies.some((b) => String(j.company || "").includes(b));
    set("company_type", isBig ? "大厂" : "中小厂");

    // 3. tier 只允许三档，其余搬到 source
    const tier = String(j.tier || "").trim();
    if (tier && !TIERS.includes(tier)) {
      if (!j.source) set("source", tier);
      set("tier", "");
      tierToSource.push(`#${j.id} ${j.company || "-"} ${j.position || "-"}：tier「${tier}」→ source`);
    } else if (!tier && !j.source && /BOSS/i.test(String(j.batch || ""))) {
      set("source", "BOSS直聊");
    }

    // 4./5. 包日期与包名
    const batchDate = parseBatchDate(j.batch, j.created_at);
    if (batchDate) set("batch_date", batchDate);
    if (!String(j.batch || "").trim() && batchDate) set("batch", `包-${batchDate}`);

    // 6. resume_id 统一 number；指向不存在的简历就置空并记账
    if (j.resume_id !== undefined && j.resume_id !== "" && j.resume_id !== null) {
      const n = Number(j.resume_id);
      if (!Number.isFinite(n)) {
        set("resume_id", "");
      } else if (!resumeIds.has(n)) {
        dangling.push(`#${j.id} ${j.company || "-"}：resume_id=${j.resume_id}`);
        set("resume_id", "");
      } else if (j.resume_id !== n) {
        set("resume_id", n);
      }
    }

    // 7. applied_date 原样保留；status 只做等价归一
    const rawStatus = String(j.status || "").trim();
    if (STATUS_ALIAS[rawStatus]) {
      set("status", STATUS_ALIAS[rawStatus]);
      statusNormalized.push(`#${j.id} ${j.company || "-"}：「${rawStatus}」→「${STATUS_ALIAS[rawStatus]}」`);
    }

    // status_changed_at：没值就用 updated_at 兜底（那是真实的最后更新时间，不是猜的）
    if (!j.status_changed_at && j.updated_at) {
      stats.status_changed_at += 1;
      j.status_changed_at = j.updated_at;
    }

    // 8. 版本标记（不碰 updated_at）
    j._migrated = VERSION;

    if (JSON.stringify(j) !== before) {
      stats.changed += 1;
      if (DRY) console.log(`~ #${j.id} ${j.company || "-"} / ${j.position || "-"}`);
    }
  });

  console.log("");
  console.log(`扫描 ${stats.scanned} 行，本次改动 ${stats.changed} 行，已迁移跳过 ${stats.skipped} 行`);
  console.log(
    `  字段变更：city ${stats.city} · city_multi ${stats.city_multi} · company_type ${stats.company_type} · ` +
      `source ${stats.source} · batch_date ${stats.batch_date} · batch ${stats.batch} · ` +
      `resume_id ${stats.resume_id} · status ${statusNormalized.length} · status_changed_at ${stats.status_changed_at}`
  );
  console.log(`  悬空 resume_id：${dangling.length} 条${dangling.length ? "\n    " + dangling.join("\n    ") : ""}`);
  console.log(`  tier 搬到 source：${tierToSource.length} 条${tierToSource.length ? "\n    " + tierToSource.join("\n    ") : ""}`);
  console.log(`  status 等价归一：${statusNormalized.length} 条${statusNormalized.length ? "\n    " + statusNormalized.join("\n    ") : ""}`);

  if (DRY) {
    console.log("\n--dry-run：没有写入任何文件。去掉 --dry-run 才会真跑。");
    return;
  }
  if (!stats.changed) {
    console.log("\n没有需要改的行，未写入。");
    return;
  }
  const backup = writeDB(db);
  console.log(`\n已写入 ${DB_FILE}\n迁移前快照：${backup}`);
}

main();
