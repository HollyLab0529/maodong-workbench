#!/usr/bin/env node
/**
 * 求职看板体检（只读，随时可跑）。
 *
 *   node scripts/check_jobs.js
 *
 * 输出：字段完整率、重复链接、同公司同岗位重复、悬空 resume_id、
 *       按包的投递进度、大厂/中小厂配比。跑包前跑一遍，比事后猜靠谱。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const DEFAULT_GROUP = {
  待投递: "todo", 简历筛选中: "applied", 测评中: "applied", 笔试中: "progress",
  一面中: "progress", 二面中: "progress", 三面中: "progress", HR面中: "progress",
  Offer: "closed", 已取消: "closed",
};

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function groupOf(status, statuses) {
  const hit = statuses.find((s) => s && s.name === status);
  if (hit?.group) return hit.group;
  return DEFAULT_GROUP[status] || "";
}

function pct(n, total) {
  return total ? `${((n / total) * 100).toFixed(0)}%` : "-";
}

function main() {
  if (!fs.existsSync(DB_FILE)) {
    console.error(`找不到数据文件：${DB_FILE}`);
    process.exit(1);
  }
  const db = readJSON(DB_FILE, {});
  const jobs = db.job_apps || [];
  const resumes = db.resumes || [];
  const policyRow = (db.settings || []).find((s) => s.key === "job_policy");
  let policy = {};
  try {
    policy = policyRow?.value ? JSON.parse(policyRow.value) : {};
  } catch {
    policy = {};
  }
  const statusRow = (db.settings || []).find((s) => s.key === "job_statuses");
  let statuses = [];
  try {
    statuses = statusRow?.value ? JSON.parse(statusRow.value) : [];
  } catch {
    statuses = [];
  }
  if (!Array.isArray(statuses)) statuses = [];

  console.log(`数据文件：${DB_FILE}`);
  console.log(`job_apps ${jobs.length} 行 · resumes ${resumes.length} 行\n`);

  if (!jobs.length) {
    console.log("没有岗位记录，先去看板加两条。");
    return;
  }

  // 1. 字段完整率
  const fields = ["company", "position", "link", "publish_date", "plan_date", "applied_date", "resume_id", "city", "batch_date", "next_action_date"];
  console.log("字段完整率");
  fields.forEach((f) => {
    const n = jobs.filter((j) => j[f] !== undefined && j[f] !== null && String(j[f]).trim() !== "").length;
    const warn = n / jobs.length < 0.5 ? "  ← 偏低" : "";
    console.log(`  ${f.padEnd(16, " ")} ${String(n).padStart(3)} / ${jobs.length}  ${pct(n, jobs.length).padStart(4)}${warn}`);
  });

  // 2. 重复链接
  const byLink = new Map();
  jobs.forEach((j) => {
    const key = String(j.link || "").trim();
    if (!key) return;
    if (!byLink.has(key)) byLink.set(key, []);
    byLink.get(key).push(j);
  });
  const dupLinks = [...byLink.entries()].filter(([, list]) => list.length > 1);
  console.log(`\n重复链接：${dupLinks.length} 组`);
  dupLinks.forEach(([link, list]) => {
    console.log(`  ${list.map((j) => `#${j.id} ${j.company}`).join(" / ")}  ${link}`);
  });

  // 3. 同公司 + 同岗位重复
  const byKey = new Map();
  jobs.forEach((j) => {
    const key = `${String(j.company || "").trim()}|${String(j.position || "").trim()}`;
    if (key === "|") return;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(j);
  });
  const dupJobs = [...byKey.entries()].filter(([, list]) => list.length > 1);
  console.log(`\n同公司同岗位重复：${dupJobs.length} 组`);
  dupJobs.forEach(([key, list]) => {
    const [company, position] = key.split("|");
    console.log(`  ${company} · ${position}  ×${list.length}（${list.map((j) => `#${j.id} ${j.status}`).join(" / ")}）`);
  });

  // 4. 悬空 resume_id
  const resumeIds = new Set(resumes.map((r) => Number(r.id)));
  const dangling = jobs.filter((j) => j.resume_id !== undefined && j.resume_id !== "" && j.resume_id !== null && !resumeIds.has(Number(j.resume_id)));
  console.log(`\n悬空 resume_id：${dangling.length} 条`);
  dangling.forEach((j) => console.log(`  #${j.id} ${j.company} → resume_id=${j.resume_id}`));

  // 5. 按包统计
  const batches = new Map();
  jobs.forEach((j) => {
    const key = String(j.batch || "").trim() || "（未分包）";
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(j);
  });
  console.log(`\n按包进度（共 ${batches.size} 包）`);
  [...batches.entries()]
    .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
    .forEach(([batch, list]) => {
      const applied = list.filter((j) => groupOf(j.status, statuses) !== "todo").length;
      const open = list.filter((j) => !["closed"].includes(groupOf(j.status, statuses))).length;
      const big = list.filter((j) => j.company_type === "大厂").length;
      console.log(`  ${batch.padEnd(18, " ")} 投 ${String(applied).padStart(2)}/${String(list.length).padStart(2)} · 在流程 ${String(open).padStart(2)} · 大厂 ${big}`);
    });

  // 6. 配比
  const big = jobs.filter((j) => j.company_type === "大厂").length;
  const mid = jobs.filter((j) => j.company_type === "中小厂").length;
  const unknown = jobs.length - big - mid;
  console.log(`\n公司配比：大厂 ${big} · 中小厂 ${mid} · 未标注 ${unknown}`);
  if (Number(policy.big_company_max_per_day)) {
    console.log(`  每日大厂上限（job_policy）：${policy.big_company_max_per_day}`);
  }
  if (Array.isArray(policy.blacklist) && policy.blacklist.length) {
    const hit = jobs.filter((j) => policy.blacklist.some((b) => String(j.company || "").includes(b)));
    console.log(`  红线公司命中：${hit.length} 条${hit.length ? " → " + hit.map((j) => `#${j.id} ${j.company}`).join(" / ") : ""}`);
  }

  // 7. 状态分布
  const byGroup = { todo: 0, applied: 0, progress: 0, closed: 0, unknown: 0 };
  jobs.forEach((j) => {
    const g = groupOf(j.status, statuses) || "unknown";
    byGroup[g] = (byGroup[g] || 0) + 1;
  });
  console.log(`\n状态分布：未投 ${byGroup.todo} · 已投等消息 ${byGroup.applied} · 流程中 ${byGroup.progress} · 结束 ${byGroup.closed} · 未识别 ${byGroup.unknown}`);
  if (byGroup.unknown) {
    const weird = [...new Set(jobs.filter((j) => !groupOf(j.status, statuses)).map((j) => j.status))];
    console.log(`  未识别状态：${weird.map((s) => `「${s || "空"}」`).join(" ")} ← 去设置里补 group 或改成已有状态`);
  }
}

main();
