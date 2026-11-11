const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const {
  tx,
  read,
  nextId,
  dailyBackup,
  getVersion,
  addSseClient,
  removeSseClient,
  DATA_DIR,
} = require("./store");

const PORT = Number(process.env.PORT || 3031);
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const SECRET_FILE = path.join(DATA_DIR, ".secret");
const TOKEN_FILE = path.join(DATA_DIR, ".assistant-token.json");
const TOKENS_FILE = path.join(DATA_DIR, "tokens.json");

function loadSecret() {
  if (process.env.WORKBENCH_SECRET) return process.env.WORKBENCH_SECRET;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, "utf8").trim();
  const s = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();

const COLLECTIONS = {
  kb_articles: ["title", "category", "tags", "content", "updated_at"],
  job_apps: ["company", "position", "status", "note", "updated_at"],
  job_events: ["app_id", "title", "event_date", "note"],
  todos: ["title", "priority", "due_date", "due_time", "location", "quadrant", "done", "repeat"],
  ideas: ["title", "detail", "status"],
  expiry_items: ["name", "category", "expire_date", "note", "used"],
  expenses: ["amount", "category", "note", "spent_at"],
  quick_notes: ["ntype", "title", "tags", "content", "promoted"],
  settings: ["key", "value"],
  // 求职深水区
  interviews: ["app_id", "company", "round", "interview_date", "interviewers", "questions", "rating", "result", "summary"],
  resumes: ["name", "target_role", "file_url", "content", "note", "in_use"],
  offers: ["company", "position", "base_salary", "months", "sign_on", "equity", "commute", "team_score", "growth_score", "note", "status"],
  // 日历
  anniversaries: ["title", "date", "repeat", "note"],
  // 邀请码
  invites: ["code", "note", "used_by", "used_at"],
  // 健身
  workouts: ["date", "part", "exercises", "duration", "note"],
  // 习惯打卡
  habits: ["title", "icon", "target_per_week"],
  habit_logs: ["habit_id", "date"],
  // 书影音
  books: ["title", "creator", "type", "status", "rating", "note"],
  // 体重
  weights: ["date", "weight", "body_fat", "note"],
  // 睡眠
  sleeps: ["date", "bedtime", "wakeup", "duration", "quality", "note"],
  // 订阅
  subs: ["name", "amount", "cycle", "next_date", "status", "note", "auto_renew", "remind_days"],
  // 旅行
  trips: ["title", "place", "start_date", "end_date", "budget", "status", "note", "items"],
  // 菜谱
  recipes: ["title", "type", "ingredients", "steps", "tags", "rating"],
};

// ---------- 会话 ----------
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expect = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(mac || "");
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function currentUser(req) {
  const payload = verify(parseCookies(req).wb_session);
  if (!payload) return null;
  return read((db) => db.users.find((u) => u.id === payload.uid) || null);
}

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "2mb" }));

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// 层 A：助手令牌（Bearer）鉴权，让我在会话里直接读写工作台
function assistantUser(req) {
  const m = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  let rec = null;
  try {
    rec = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
  } catch {
    return null;
  }
  if (!rec || !rec.hash) return null;
  const a = Buffer.from(sha256(m[1].trim()));
  const b = Buffer.from(rec.hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return read((db) => db.users.find((u) => u.id === rec.uid) || null);
}

function requireAuth(req, res, next) {
  const user = currentUser(req) || assistantUser(req);
  if (!user) return res.status(401).json({ error: "未登录" });
  req.user = user;
  next();
}

// ---------- 开放 API 令牌（多枚、可分权限） ----------
function readTokens() {
  try {
    const list = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeTokens(list) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(list, null, 2), { mode: 0o600 });
}

/** 校验 Bearer 令牌 → { user, token }；兼容旧的单助手令牌（视为 write 权限） */
const LAST_TOUCH = new Map(); // tokenId → 上次落盘时间戳（60s 节流）
function apiCaller(req) {
  const m = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const raw = m[1].trim();
  const hash = sha256(raw);
  const rec = readTokens().find((t) => !t.revoked && t.hash === hash);
  if (rec) {
    const now = Date.now();
    if (!LAST_TOUCH.has(rec.id) || now - LAST_TOUCH.get(rec.id) > 60000) {
      const list = readTokens();
      const item = list.find((t) => t.id === rec.id);
      if (item) {
        item.last_used_at = new Date().toISOString();
        writeTokens(list);
      }
      LAST_TOUCH.set(rec.id, now);
    }
    const user = read((db) => db.users.find((u) => u.id === rec.uid) || null);
    return user ? { user, token: rec } : null;
  }
  // 兼容旧助手令牌
  const legacy = assistantUser(req);
  return legacy ? { user: legacy, token: { id: "legacy", name: "助手令牌", scope: "write" } } : null;
}

/** /api/v1 鉴权：需要 open API 令牌；write 类操作额外校验权限 */
function requireApi(scope) {
  return (req, res, next) => {
    const caller = apiCaller(req);
    if (!caller) return res.status(401).json({ error: "令牌无效或已吊销", hint: "在设置 → API 访问中创建令牌" });
    if (scope === "write" && caller.token.scope !== "write") {
      return res.status(403).json({ error: "该令牌只有读取权限" });
    }
    if (!rateLimitOk(caller.token.id, res)) return;
    req.user = caller.user;
    req.apiToken = caller.token;
    next();
  };
}

// 简单内存限流：每令牌 120 次/分钟
const RATE = new Map();
function rateLimitOk(tokenId, res) {
  const now = Date.now();
  const win = RATE.get(tokenId) || { start: now, count: 0 };
  if (now - win.start > 60000) {
    win.start = now;
    win.count = 0;
  }
  win.count += 1;
  RATE.set(tokenId, win);
  if (win.count > 120) {
    res.set("Retry-After", "60").status(429).json({ error: "请求过于频繁，每分钟上限 120 次" });
    return false;
  }
  res.set("X-RateLimit-Remaining", String(Math.max(0, 120 - win.count)));
  return true;
}

// ---------- 助手令牌管理（需页面登录态） ----------
app.post("/api/assistant/token", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "未登录" });
  const token = crypto.randomBytes(24).toString("base64url");
  fs.writeFileSync(
    TOKEN_FILE,
    JSON.stringify({ hash: sha256(token), uid: user.id, created_at: new Date().toISOString() }),
    { mode: 0o600 }
  );
  res.json({ token });
});

app.get("/api/assistant/token", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "未登录" });
  let rec = null;
  try {
    rec = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
  } catch {
    rec = null;
  }
  res.json({ exists: !!rec, created_at: rec?.created_at || null });
});

app.delete("/api/assistant/token", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "未登录" });
  try {
    fs.unlinkSync(TOKEN_FILE);
  } catch {
    /* 已不存在 */
  }
  res.json({ ok: true });
});

// ---------- 开放 API 令牌管理（需页面登录态） ----------
app.get("/api/tokens", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "未登录" });
  const list = readTokens()
    .filter((t) => t.uid === user.id && !t.revoked)
    .map(({ id, name, prefix, scope, created_at, last_used_at }) => ({
      id, name, prefix, scope, created_at, last_used_at,
    }));
  res.json({ tokens: list });
});

app.post("/api/tokens", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "未登录" });
  const name = String((req.body || {}).name || "").trim().slice(0, 30) || "未命名令牌";
  const scope = (req.body || {}).scope === "read" ? "read" : "write";
  const raw = "wb_" + crypto.randomBytes(18).toString("hex");
  const rec = {
    id: "t_" + crypto.randomBytes(6).toString("hex"),
    uid: user.id,
    name,
    scope,
    prefix: raw.slice(0, 10),
    hash: sha256(raw),
    created_at: new Date().toISOString(),
    last_used_at: null,
  };
  writeTokens([...readTokens(), rec]);
  // 明文只在创建时返回这一次
  res.json({ token: { ...rec, hash: undefined }, plain: raw });
});

app.delete("/api/tokens/:id", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "未登录" });
  const list = readTokens();
  const item = list.find((t) => t.id === req.params.id && t.uid === user.id && !t.revoked);
  if (!item) return res.status(404).json({ error: "令牌不存在" });
  item.revoked = true;
  item.revoked_at = new Date().toISOString();
  writeTokens(list);
  res.json({ ok: true });
});

// ---------- 认证 ----------
app.get("/api/auth/config", (req, res) => {
  // 是否需要邀请码：首个账号开放注册，之后需邀请码
  const need = read((db) => db.users.length > 0);
  res.json({ needInvite: need });
});

app.post("/api/auth/register", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const invite = String(req.body.invite || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "邮箱格式不正确" });
  if (password.length < 6) return res.status(400).json({ error: "密码至少 6 位" });

  const exists = read((db) => db.users.some((u) => u.email === email));
  if (exists) return res.status(400).json({ error: "该邮箱已注册" });

  const hash = await bcrypt.hash(password, 10);
  let user;
  try {
    user = await tx((db) => {
    // 第一个账号免邀请码；之后必须持有效未用邀请码
    if (db.users.length > 0) {
      const inv = db.invites.find((i) => i.code === invite && !i.used_by);
      if (!inv) throw new Error("邀请码无效或已被使用");
    }
    const u = { id: nextId(db, "users"), email, password: hash, nickname: "", avatar: "", bio: "", modules: "", created_at: new Date().toISOString() };
    db.users.push(u);
    const inv = db.invites.find((i) => i.code === invite && !i.used_by);
    if (inv) {
      inv.used_by = u.email;
      inv.used_at = new Date().toISOString();
    }
    db.kb_articles.push({
      id: nextId(db, "kb_articles"),
      user_id: u.id,
      title: "工作台使用说明",
      category: "工具技巧",
      tags: "入门, 说明",
      content:
        "## 这是什么\n这是你自己的个人工作台，数据全部存在你的服务器上。\n\n## 六个模块\n- **总览**：今日待办、求职进展、最近沉淀\n- **知识库**：分类 + 标签 + 搜索，支持 Markdown 和图片\n- **求职进度**：公司 × 状态 × 进展时间线\n- **待办清单**：优先级 + 截止日期 + 重复任务\n- **记账**：本月汇总 + 分类占比 + 半年趋势\n- **随笔记**：选类型按模板快速记录，可一键升级为知识库文章\n- **时间线**：所有动态按日期回看\n\n## 实用功能\n- **⌘K / Ctrl+K**：全局搜索所有模块\n- **多设备**：手机电脑登录同一账号，数据实时同步\n- **数据备份**：服务器每天自动备份，保留 14 天；也可随时导出 JSON",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return u;
    });
  } catch (e) {
    return res.status(400).json({ error: e.message || "注册失败" });
  }

  const token = sign({ uid: user.id, exp: Date.now() + 30 * 24 * 3600 * 1000 });
  res.setHeader(
    "Set-Cookie",
    `wb_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${30 * 24 * 3600}`
  );
  res.json({ user: { id: user.id, email: user.email } });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = read((db) => db.users.find((u) => u.email === email));
  if (!user) return res.status(400).json({ error: "邮箱或密码错误" });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: "邮箱或密码错误" });

  const token = sign({ uid: user.id, exp: Date.now() + 30 * 24 * 3600 * 1000 });
  res.setHeader(
    "Set-Cookie",
    `wb_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${30 * 24 * 3600}`
  );
  res.json({ user: { id: user.id, email: user.email } });
});

app.post("/api/auth/logout", (req, res) => {
  res.setHeader("Set-Cookie", "wb_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
  res.json({ ok: true });
});

// 创作者（服务器主人）：首个注册账号，或用 OWNER_EMAIL 指定
function isOwner(u) {
  if (!u) return false;
  const ownerEmail = String(process.env.OWNER_EMAIL || "").trim().toLowerCase();
  if (ownerEmail) return String(u.email || "").toLowerCase() === ownerEmail;
  return u.id === 1;
}

function publicUser(u) {
  let modules = null;
  try {
    modules = u.modules ? JSON.parse(u.modules) : null;
  } catch {
    modules = null;
  }
  return { id: u.id, email: u.email, nickname: u.nickname || "", avatar: u.avatar || "", bio: u.bio || "", modules, is_owner: isOwner(u) };
}

app.get("/api/auth/me", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "未登录" });
  res.json({ user: publicUser(user) });
});

// 个人资料：头像 / 昵称 / 一句话签名
app.patch("/api/auth/profile", (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: "未登录" });
  const b = req.body || {};
  const patch = {};
  if (b.nickname !== undefined) patch.nickname = String(b.nickname).slice(0, 24);
  if (b.bio !== undefined) patch.bio = String(b.bio).slice(0, 60);
  if (b.avatar !== undefined) {
    const v = String(b.avatar);
    if (v && !/^\/uploads\/[\w.-]+$/.test(v)) return res.status(400).json({ error: "头像地址不合法" });
    patch.avatar = v;
  }
  if (b.modules !== undefined) {
    // 模块配置：{ enabled: [id...], order: [id...] }，数组元素限 id 形态
    const m = b.modules;
    const okArr = (a) => Array.isArray(a) && a.length <= 30 && a.every((x) => typeof x === "string" && /^[\w-]{1,24}$/.test(x));
    if (!m || typeof m !== "object" || Array.isArray(m) || !okArr(m.enabled || []) || !okArr(m.order || [])) {
      return res.status(400).json({ error: "模块配置不合法" });
    }
    patch.modules = JSON.stringify({ enabled: m.enabled || [], order: m.order || [] });
  }
  tx((db) => {
    const u = db.users.find((x) => x.id === user.id);
    if (!u) throw new Error("用户不存在");
    Object.assign(u, patch);
    return publicUser(u);
  })
    .then((u) => res.json({ user: u }))
    .catch((e) => res.status(400).json({ error: e.message }));
});

// ---------- 邀请码 ----------
function sanitizeInvite(i) {
  return { id: i.id, code: i.code, note: i.note || "", used_by: i.used_by || "", used_at: i.used_at || "", created_at: i.created_at || "" };
}

// ---------- 灵感池：创作者视角（可看到所有用户的灵感） ----------
app.get("/api/ideas/all", requireAuth, (req, res) => {
  if (!isOwner(req.user)) return res.status(403).json({ error: "只有创作者可以查看全部灵感" });
  const rows = read((db) => {
    const users = Object.fromEntries(db.users.map((u) => [u.id, u]));
    return db.ideas
      .map((i) => ({
        ...i,
        author_email: users[i.user_id]?.email || "",
        author_nickname: users[i.user_id]?.nickname || "",
      }))
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  });
  res.json({ rows });
});

app.patch("/api/ideas/:id", requireAuth, (req, res) => {
  if (!isOwner(req.user)) return res.status(403).json({ error: "只有创作者可以处理灵感" });
  const id = Number(req.params.id);
  const body = req.body || {};
  tx((db) => {
    const row = db.ideas.find((i) => i.id === id);
    if (!row) throw new Error("条目不存在");
    if (body.status !== undefined) row.status = String(body.status);
    row.updated_at = new Date().toISOString();
    return row;
  })
    .then((r) => res.json({ row: r }))
    .catch((e) => res.status(400).json({ error: e.message }));
});

app.delete("/api/ideas/:id", requireAuth, (req, res) => {
  if (!isOwner(req.user)) return res.status(403).json({ error: "只有创作者可以删除灵感" });
  const id = Number(req.params.id);
  tx((db) => {
    const idx = db.ideas.findIndex((i) => i.id === id);
    if (idx < 0) throw new Error("条目不存在");
    db.ideas.splice(idx, 1);
    return { ok: true };
  })
    .then((r) => res.json(r))
    .catch((e) => res.status(400).json({ error: e.message }));
});

app.get("/api/invites", requireAuth, (req, res) => {
  const rows = read((db) =>
    db.invites
      .filter((i) => i.owner === req.user.id)
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      .map(sanitizeInvite)
  );
  res.json({ rows });
});

app.post("/api/invites", requireAuth, (req, res) => {
  const note = String((req.body || {}).note || "").slice(0, 30);
  tx((db) => {
    const r = {
      id: nextId(db, "invites"),
      owner: req.user.id,
      code: crypto.randomBytes(4).toString("hex").toUpperCase(),
      note,
      created_at: new Date().toISOString(),
    };
    db.invites.push(r);
    return sanitizeInvite(r);
  })
    .then((row) => res.json({ row }))
    .catch((e) => res.status(500).json({ error: e.message }));
});

app.delete("/api/invites/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  tx((db) => {
    const idx = db.invites.findIndex((i) => i.id === id && i.owner === req.user.id);
    if (idx === -1) throw new Error("邀请码不存在");
    if (db.invites[idx].used_by) throw new Error("已使用的邀请码不能删除");
    db.invites.splice(idx, 1);
    return true;
  })
    .then(() => res.json({ ok: true }))
    .catch((e) => res.status(400).json({ error: e.message }));
});

// ---------- 反馈看板（同机 Python 服务 :8710，令牌只留在服务器端） ----------
const FEEDBACK_BASE = process.env.FEEDBACK_BASE || "http://127.0.0.1:8710";

function feedbackToken() {
  try {
    return fs.readFileSync(path.join(DATA_DIR, ".feedback-token"), "utf8").trim();
  } catch {
    return "";
  }
}

async function fbGet(pathname, token) {
  const r = await fetch(`${FEEDBACK_BASE}${pathname}`, {
    headers: { "X-Admin-Token": token },
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`反馈服务返回 ${r.status}`);
  return r.json();
}

app.get("/api/feedback/overview", requireAuth, async (req, res) => {
  const token = feedbackToken();
  if (!token) {
    return res.json({ ok: false, reason: "unconfigured", error: "服务器上还没有配置反馈看板令牌" });
  }
  try {
    const [stats, list] = await Promise.all([
      fbGet("/api/stats", token),
      fbGet("/api/feedback/list", token),
    ]);
    res.json({
      ok: true,
      stats,
      items: (list.items || []).map(({ id, content, contact, page, created_at }) => ({
        id, content, contact, page, created_at,
      })),
      count: list.count || 0,
    });
  } catch (e) {
    res.json({ ok: false, reason: "unreachable", error: e.message });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ---------- 实时同步（SSE） ----------
app.get("/api/events", requireAuth, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`data: ${JSON.stringify({ v: getVersion() })}\n\n`);
  addSseClient(res);
  const hb = setInterval(() => {
    try {
      res.write(":hb\n\n");
    } catch {
      /* ignore */
    }
  }, 25000);
  req.on("close", () => {
    clearInterval(hb);
    removeSseClient(res);
  });
});

// ---------- 导出备份 ----------
app.get("/api/export", requireAuth, (req, res) => {
  const data = read((db) => {
    const out = {};
    for (const coll of Object.keys(COLLECTIONS)) {
      out[coll] = db[coll].filter((r) => r.user_id === req.user.id);
    }
    return out;
  });
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=workbench-export-${new Date().toISOString().slice(0, 10)}.json`
  );
  res.json({ exported_at: new Date().toISOString(), email: req.user.email, data });
});

// ---------- 图片上传 ----------
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname || "") || ".bin").toLowerCase().slice(0, 8);
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/|^application\/pdf$|msword|wordprocessingml/.test(file.mimetype || "");
    if (ok) return cb(null, true);
    cb(new Error("只支持图片、PDF 或 Word 文件"));
  },
});

app.post("/api/upload", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "未收到文件" });
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "30d" }));

// ---------- 链接元信息抓取 ----------
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

app.post("/api/fetch-meta", requireAuth, async (req, res) => {
  let url = String(req.body.url || "").trim();
  if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: "请输入 http/https 链接" });
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WorkbenchBot/1.0)" },
    });
    clearTimeout(timer);
    const html = (await resp.text()).slice(0, 500000);

    const pick = (...patterns) => {
      for (const re of patterns) {
        const m = html.match(re);
        if (m && m[1]) return decodeEntities(m[1]);
      }
      return "";
    };
    const title =
      pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
           /<title[^>]*>([^<]+)<\/title>/i) || "";
    const description =
      pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
           /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || "";
    let image = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);

    if (image) {
      try {
        image = new URL(image, url).href;
        const imgResp = await fetch(image, {
          signal: AbortSignal.timeout(8000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; WorkbenchBot/1.0)" },
        });
        const type = imgResp.headers.get("content-type") || "";
        if (imgResp.ok && type.startsWith("image/")) {
          const buf = Buffer.from(await imgResp.arrayBuffer());
          if (buf.length < 8 * 1024 * 1024) {
            const ext = type.includes("png") ? ".png" : type.includes("webp") ? ".webp" : type.includes("gif") ? ".gif" : ".jpg";
            const name = `og-${crypto.randomBytes(6).toString("hex")}${ext}`;
            fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
            image = `/uploads/${name}`;
          }
        } else {
          image = "";
        }
      } catch {
        image = "";
      }
    }
    res.json({ title, description, image });
  } catch (e) {
    res.status(400).json({ error: "抓取失败：" + (e.name === "AbortError" ? "超时" : e.message) });
  }
});

// ---------- 开放 API v1（Bearer 令牌，供脚本 / 快捷指令 / AI 调用） ----------
// 可通过 API 访问的集合（白名单：不开放邀请码、系统设置等敏感数据）
const API_COLLECTIONS = new Set([
  "kb_articles", "job_apps", "job_events", "todos", "expenses", "quick_notes",
  "interviews", "resumes", "offers", "anniversaries", "workouts", "habits",
  "habit_logs", "books", "weights", "sleeps", "subs", "trips", "recipes", "ideas", "expiry_items",
]);

function apiCollParam(req, res) {
  const coll = req.params.coll;
  if (!API_COLLECTIONS.has(coll)) {
    res.status(404).json({ error: `未知集合 ${coll}`, hint: "GET /api/v1/schema 查看可用集合" });
    return null;
  }
  return coll;
}

app.get("/api/v1/me", requireApi("read"), (req, res) => {
  const u = req.user;
  res.json({
    user: { id: u.id, email: u.email, nickname: u.nickname || "", bio: u.bio || "" },
    token: { name: req.apiToken.name, scope: req.apiToken.scope },
  });
});

app.get("/api/v1/schema", requireApi("read"), (req, res) => {
  const schema = {};
  API_COLLECTIONS.forEach((coll) => {
    schema[coll] = { fields: COLLECTIONS[coll], methods: ["GET", "POST", "PATCH", "DELETE"] };
  });
  res.json({ version: 1, collections: schema, docs: "GET /api-doc 查看文档页" });
});

app.get("/api/v1/summary", requireApi("read"), (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const uid = req.user.id;
  const data = read((db) => {
    const mine = (c) => db[c].filter((r) => r.user_id === uid);
    const todos = mine("todos");
    const expenses = mine("expenses").filter((e) => String(e.spent_at || "").startsWith(month));
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const renewSoon = mine("subs").filter(
      (s) => s.status === "active" && String(s.auto_renew) === "1" && s.cycle !== "once" &&
        s.next_date && s.next_date >= today && s.next_date <= in7
    );
    const in60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
    const anniversaries = mine("anniversaries").filter((a) => a.date >= today && a.date <= in60);
    return { todos, expenses, renewSoon, anniversaries, kb: mine("kb_articles").length };
  });
  res.json({
    date: today,
    todos: {
      open: data.todos.filter((t) => !t.done).length,
      due_today: data.todos.filter((t) => !t.done && t.due_date === today).length,
    },
    expenses: {
      month_total: Number(data.expenses.reduce((s, e) => s + Number(e.amount || 0), 0).toFixed(2)),
      month_count: data.expenses.length,
    },
    subs_renew_soon: data.renewSoon.map((s) => ({ name: s.name, amount: s.amount, next_date: s.next_date })),
    anniversaries_soon: data.anniversaries.map((a) => ({ title: a.title, date: a.date })),
    kb_articles: data.kb,
  });
});

// 一句话快速捕捉：给快捷指令 / AI 用
app.post("/api/v1/capture", requireApi("write"), (req, res) => {
  const { type, ...body } = req.body || {};
  const now = new Date().toISOString();
  let coll;
  const row = { user_id: req.user.id, created_at: now };
  if (type === "todo") {
    coll = "todos";
    if (!body.title) return res.status(400).json({ error: "todo 需要 title" });
    Object.assign(row, { title: String(body.title), priority: "medium", done: false });
    if (body.due_date) row.due_date = body.due_date;
  } else if (type === "note") {
    coll = "quick_notes";
    if (!body.title) return res.status(400).json({ error: "note 需要 title" });
    Object.assign(row, { ntype: body.ntype || "灵感", title: String(body.title), content: body.content || "" });
  } else if (type === "expense") {
    coll = "expenses";
    const amount = Number(body.amount);
    if (!amount || amount <= 0) return res.status(400).json({ error: "expense 需要 amount（正数）" });
    Object.assign(row, { amount, category: body.category || "其他", note: body.note || "", spent_at: body.spent_at || now.slice(0, 10) });
  } else {
    return res.status(400).json({ error: "type 仅支持 todo / note / expense" });
  }
  tx((db) => {
    row.id = nextId(db, coll);
    db[coll].push(row);
    return row;
  })
    .then((r) => res.json({ ok: true, row: r }))
    .catch((e) => res.status(500).json({ error: e.message }));
});

app.get("/api/v1/:coll", requireApi("read"), (req, res) => {
  const coll = apiCollParam(req, res);
  if (!coll) return;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const q = String(req.query.q || "").trim().toLowerCase();
  const since = String(req.query.since || "");
  const fields = COLLECTIONS[coll];
  let rows = read((db) => db[coll].filter((r) => r.user_id === req.user.id));
  if (since) rows = rows.filter((r) => String(r.created_at || "").slice(0, 19) > since);
  if (q) {
    rows = rows.filter((r) =>
      fields.some((f) => String(r[f] ?? "").toLowerCase().includes(q))
    );
  }
  rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  res.json({ total: rows.length, rows: rows.slice(offset, offset + limit) });
});

app.post("/api/v1/:coll", requireApi("write"), (req, res) => {
  const coll = apiCollParam(req, res);
  if (!coll) return;
  const body = req.body || {};
  const row = { user_id: req.user.id, created_at: new Date().toISOString() };
  COLLECTIONS[coll].forEach((f) => {
    if (body[f] !== undefined) row[f] = body[f];
  });
  tx((db) => {
    row.id = nextId(db, coll);
    db[coll].push(row);
    return row;
  })
    .then((r) => res.status(201).json({ row: r }))
    .catch((e) => res.status(500).json({ error: e.message }));
});

app.patch("/api/v1/:coll/:id", requireApi("write"), (req, res) => {
  const coll = apiCollParam(req, res);
  if (!coll) return;
  const id = Number(req.params.id);
  const body = req.body || {};
  tx((db) => {
    const row = db[coll].find((r) => r.id === id && r.user_id === req.user.id);
    if (!row) throw new Error("记录不存在");
    COLLECTIONS[coll].forEach((f) => {
      if (body[f] !== undefined) row[f] = body[f];
    });
    row.updated_at = new Date().toISOString();
    return row;
  })
    .then((r) => res.json({ row: r }))
    .catch((e) => res.status(400).json({ error: e.message }));
});

app.delete("/api/v1/:coll/:id", requireApi("write"), (req, res) => {
  const coll = apiCollParam(req, res);
  if (!coll) return;
  const id = Number(req.params.id);
  tx((db) => {
    const idx = db[coll].findIndex((r) => r.id === id && r.user_id === req.user.id);
    if (idx === -1) throw new Error("记录不存在");
    db[coll].splice(idx, 1);
    return true;
  })
    .then(() => res.json({ ok: true }))
    .catch((e) => res.status(400).json({ error: e.message }));
});

// ---------- 通用 CRUD ----------
function collParam(req, res) {
  const coll = req.params.coll;
  if (!COLLECTIONS[coll]) {
    res.status(404).json({ error: "未知数据集合" });
    return null;
  }
  return coll;
}

app.get("/api/data/:coll", requireAuth, (req, res) => {
  const coll = collParam(req, res);
  if (!coll) return;
  const rows = read((db) =>
    db[coll]
      .filter((r) => r.user_id === req.user.id)
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
  );
  res.json({ rows });
});

app.post("/api/data/:coll", requireAuth, (req, res) => {
  const coll = collParam(req, res);
  if (!coll) return;
  const body = req.body || {};
  const row = { user_id: req.user.id, created_at: new Date().toISOString() };
  COLLECTIONS[coll].forEach((f) => {
    if (body[f] !== undefined) row[f] = body[f];
  });
  tx((db) => {
    row.id = nextId(db, coll);
    db[coll].push(row);
    return row;
  })
    .then((r) => res.json({ row: r }))
    .catch((e) => res.status(500).json({ error: e.message }));
});

app.patch("/api/data/:coll/:id", requireAuth, (req, res) => {
  const coll = collParam(req, res);
  if (!coll) return;
  const id = Number(req.params.id);
  const body = req.body || {};
  tx((db) => {
    const row = db[coll].find((r) => r.id === id && r.user_id === req.user.id);
    if (!row) throw new Error("记录不存在");
    COLLECTIONS[coll].forEach((f) => {
      if (body[f] !== undefined) row[f] = body[f];
    });
    row.updated_at = new Date().toISOString();
    return row;
  })
    .then((r) => res.json({ row: r }))
    .catch((e) => res.status(400).json({ error: e.message }));
});

app.delete("/api/data/:coll/:id", requireAuth, (req, res) => {
  const coll = collParam(req, res);
  if (!coll) return;
  const id = Number(req.params.id);
  tx((db) => {
    const idx = db[coll].findIndex((r) => r.id === id && r.user_id === req.user.id);
    if (idx === -1) throw new Error("记录不存在");
    db[coll].splice(idx, 1);
    return true;
  })
    .then(() => res.json({ ok: true }))
    .catch((e) => res.status(400).json({ error: e.message }));
});

// ---------- AI（OpenAI 兼容代理 + 能力端点） ----------
app.use("/api/ai", require("./ai")({ requireAuth, currentUser, read, DATA_DIR, SECRET }));

// ---------- 静态资源 ----------
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR, { index: "index.html", maxAge: "1h" }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) return next();
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });
} else {
  app.get("*", (req, res) => res.status(503).send("前端尚未构建：请把构建产物放到 public/ 目录"));
}

// 启动时做一次备份检查，之后每 6 小时检查一次
dailyBackup();
setInterval(dailyBackup, 6 * 3600 * 1000);

app.listen(PORT, "127.0.0.1", () => {
  console.log(`workbench 已启动：http://127.0.0.1:${PORT}  数据目录：${DATA_DIR}`);
});
