#!/usr/bin/env node
/**
 * 清理孤儿上传文件：data/uploads/ 里没有 documents 引用的文件。
 *
 *   node scripts/clean_orphan_uploads.js            # 只列出，不删
 *   node scripts/clean_orphan_uploads.js --delete   # 真删
 *
 * 引用来路：resumes.file_url、job_events.image、users.avatar、kb_articles 的正文里出现的 /uploads/ 路径。
 * 判断保守：只要任何一处文本里出现过文件名，就算有人用。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DELETE = process.argv.includes("--delete");

function main() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    console.log(`没有上传目录：${UPLOAD_DIR}`);
    return;
  }
  if (!fs.existsSync(DB_FILE)) {
    console.error(`找不到数据文件：${DB_FILE}`);
    process.exit(1);
  }
  const dbRaw = fs.readFileSync(DB_FILE, "utf8");
  const files = fs.readdirSync(UPLOAD_DIR).filter((f) => !f.startsWith("."));

  const orphans = [];
  let used = 0;
  files.forEach((name) => {
    if (dbRaw.includes(name)) {
      used += 1;
      return;
    }
    const full = path.join(UPLOAD_DIR, name);
    const stat = fs.statSync(full);
    if (!stat.isFile()) return;
    orphans.push({ name, size: stat.size, mtime: stat.mtime });
  });

  console.log(`上传目录：${UPLOAD_DIR}`);
  console.log(`文件 ${files.length} 个 · 有引用 ${used} 个 · 孤儿 ${orphans.length} 个`);

  if (!orphans.length) {
    console.log("干净，没有孤儿文件。");
    return;
  }
  const totalMB = orphans.reduce((s, o) => s + o.size, 0) / 1024 / 1024;
  orphans
    .sort((a, b) => b.mtime - a.mtime)
    .forEach((o) => {
      const mb = (o.size / 1024 / 1024).toFixed(2);
      console.log(`  ${o.mtime.toISOString().slice(0, 10)}  ${mb.padStart(6)} MB  ${o.name}`);
    });
  console.log(`合计可省 ${totalMB.toFixed(2)} MB`);

  if (!DELETE) {
    console.log("\n只是列出来，没有删。确认没问题再加 --delete。");
    return;
  }
  let removed = 0;
  orphans.forEach((o) => {
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, o.name));
      removed += 1;
    } catch (e) {
      console.log(`  删除失败 ${o.name}：${e.message}`);
    }
  });
  console.log(`\n已删除 ${removed} 个文件。`);
}

main();
