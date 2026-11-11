const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "db.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

const DEFAULT_DB = {
  users: [],
  kb_articles: [],
  job_apps: [],
  job_events: [],
  todos: [],
  ideas: [],
  expiry_items: [],
  accounts: [],
  expenses: [],
  quick_notes: [],
  note_tags: [],
  settings: [],
  interviews: [],
  resumes: [],
  offers: [],
  anniversaries: [],
  invites: [],
  workouts: [],
  habits: [],
  habit_logs: [],
  books: [],
  weights: [],
  sleeps: [],
  subs: [],
  trips: [],
  wishes: [],
  recipes: [],
  _seq: {},
};

let cache = null;
let queue = Promise.resolve();
let version = 0;
const sseClients = new Set();

function ensure() {
  if (cache) return cache;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(FILE, "utf8"));
    } catch (e) {
      const backup = FILE + ".broken-" + Date.now();
      fs.copyFileSync(FILE, backup);
      console.error("db.json 解析失败，已备份到", backup);
      cache = null;
    }
  }
  if (!cache) cache = JSON.parse(JSON.stringify(DEFAULT_DB));
  for (const key of Object.keys(DEFAULT_DB)) {
    if (!cache[key] || typeof cache[key] !== "object") {
      cache[key] = JSON.parse(JSON.stringify(DEFAULT_DB[key]));
    }
  }
  return cache;
}

async function persist() {
  const tmp = FILE + ".tmp";
  await fs.promises.writeFile(tmp, JSON.stringify(cache, null, 2), "utf8");
  await fs.promises.rename(tmp, FILE);
  // 写入后补一次备份检查（幂等，每天最多生成一份）
  try {
    dailyBackup();
  } catch {
    /* ignore */
  }
}

function nextId(db, coll) {
  db._seq[coll] = (db._seq[coll] || 0) + 1;
  return db._seq[coll];
}

function broadcast() {
  const payload = `data: ${JSON.stringify({ v: version })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

// 写事务：串行执行，避免并发写坏文件；每次写完广播版本号
function tx(fn) {
  const run = queue.then(async () => {
    const db = ensure();
    const result = await fn(db);
    await persist();
    version += 1;
    broadcast();
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

function read(fn) {
  return fn(ensure());
}

function getVersion() {
  return version;
}

function addSseClient(res) {
  sseClients.add(res);
}

function removeSseClient(res) {
  sseClients.delete(res);
}

// 每日自动备份：保留最近 14 份
function dailyBackup() {
  try {
    if (!fs.existsSync(FILE)) return;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const name = `db-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
    const target = path.join(BACKUP_DIR, name);
    if (!fs.existsSync(target)) {
      fs.copyFileSync(FILE, target);
      console.log("已生成每日备份:", name);
    }
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("db-") && f.endsWith(".json"))
      .sort();
    while (files.length > 14) {
      fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
    }
  } catch (e) {
    console.error("备份失败:", e.message);
  }
}

module.exports = {
  tx,
  read,
  nextId,
  dailyBackup,
  getVersion,
  addSseClient,
  removeSseClient,
  DATA_DIR,
  FILE,
  BACKUP_DIR,
};
