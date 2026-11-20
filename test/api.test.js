// 猫冬手帐最小回归测试：起真实服务进程，用 HTTP 覆盖鉴权、数据白名单、用户隔离、
// 并发写事务、令牌权限、导出结构、重启持久化与演示站模式。
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const PORT = 3311;
const DEMO_PORT = 3312;
const BASE = `http://127.0.0.1:${PORT}`;
const DEMO_BASE = `http://127.0.0.1:${DEMO_PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer({ port, dataDir, env = {} }) {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_ENV: "test", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));
  return { child, getStderr: () => stderr };
}

async function waitHealthy(base, getStderr) {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`服务启动超时:\n${getStderr()}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  for (let i = 0; i < 60 && child.exitCode === null; i++) await sleep(50);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function req(base, p, { method = "GET", body, cookie, token } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + p, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, json, text, res };
}

function cookieOf(res) {
  const raw = res.headers.get("set-cookie") || "";
  const m = raw.match(/wb_session=([^;]+)/);
  return m ? `wb_session=${m[1]}` : "";
}

describe("核心接口与数据安全", () => {
  let dataDir, server, cookieA, cookieB, tokenRead, tokenWrite;

  before(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), "wb-test-"));
    server = startServer({ port: PORT, dataDir });
    await waitHealthy(BASE, server.getStderr);

    // 首个账号免邀请码
    const reg = await req(BASE, "/api/auth/register", {
      method: "POST",
      body: { email: "a@test.dev", password: "secret123" },
    });
    assert.equal(reg.status, 200, reg.text);
    cookieA = cookieOf(reg.res);
    assert.ok(cookieA, "注册应返回会话 Cookie");
  });

  after(async () => {
    await stopServer(server.child);
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("健康检查", async () => {
    const r = await req(BASE, "/api/health");
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
  });

  test("未登录访问数据接口应 401", async () => {
    const r = await req(BASE, "/api/data/todos");
    assert.equal(r.status, 401);
  });

  test("创建待办：字段白名单生效，user_id 不可冒充", async () => {
    const r = await req(BASE, "/api/data/todos", {
      method: "POST",
      cookie: cookieA,
      body: { title: "白名单验证", priority: "高", quadrant: "q2", user_id: 999, evil: "注入字段" },
    });
    assert.equal(r.status, 200, r.text);
    const row = r.json.row;
    assert.equal(row.title, "白名单验证");
    assert.equal(row.user_id, 1, "user_id 必须来自会话，不能用请求体");
    assert.equal(row.evil, undefined, "未在白名单中的字段应被丢弃");
  });

  test("未知集合应 404", async () => {
    const r = await req(BASE, "/api/data/not_a_collection", { cookie: cookieA });
    assert.equal(r.status, 404);
  });

  test("邀请码注册 + 用户数据隔离", async () => {
    const inv = await req(BASE, "/api/invites", { method: "POST", cookie: cookieA, body: { note: "测试邀请" } });
    assert.equal(inv.status, 200, inv.text);
    const code = inv.json.row.code;
    assert.ok(code);

    const regB = await req(BASE, "/api/auth/register", {
      method: "POST",
      body: { email: "b@test.dev", password: "secret123", invite: code },
    });
    assert.equal(regB.status, 200, regB.text);
    cookieB = cookieOf(regB.res);

    await req(BASE, "/api/data/todos", { method: "POST", cookie: cookieB, body: { title: "B 的待办" } });

    const listA = await req(BASE, "/api/data/todos", { cookie: cookieA });
    const listB = await req(BASE, "/api/data/todos", { cookie: cookieB });
    assert.ok(listA.json.rows.every((t) => t.user_id === 1), "A 不应看到 B 的数据");
    assert.ok(listB.json.rows.every((t) => t.user_id === 2), "B 只应看到自己的数据");
    assert.equal(listB.json.rows.length, 1);
  });

  test("并发写入不丢数据（tx 串行事务）", async () => {
    const N = 20;
    const before = (await req(BASE, "/api/data/ideas", { cookie: cookieA })).json.rows.length;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        req(BASE, "/api/data/ideas", { method: "POST", cookie: cookieA, body: { title: `并发-${i}` } })
      )
    );
    assert.ok(results.every((r) => r.status === 200), "所有并发写都应成功");
    const after = (await req(BASE, "/api/data/ideas", { cookie: cookieA })).json.rows.length;
    assert.equal(after - before, N, "并发写入条数应完全一致");

    // id 不重复（nextId 在事务内分配）
    const ids = results.map((r) => r.json.row.id);
    assert.equal(new Set(ids).size, N, "并发分配的 id 不应重复");
  });

  test("令牌权限：只读令牌不能写，读写令牌可以写", async () => {
    const mk = async (scope) => {
      const r = await req(BASE, "/api/tokens", { method: "POST", cookie: cookieA, body: { name: `t-${scope}`, scope } });
      assert.equal(r.status, 200, r.text);
      return r.json.plain; // 明文只在创建时返回一次
    };
    tokenRead = await mk("read");
    tokenWrite = await mk("write");

    const readGet = await req(BASE, "/api/data/todos", { token: tokenRead });
    assert.equal(readGet.status, 200, "只读令牌应能读");

    const readPost = await req(BASE, "/api/data/todos", { method: "POST", token: tokenRead, body: { title: "越权写" } });
    assert.equal(readPost.status, 403, "只读令牌写入应 403");

    const writePost = await req(BASE, "/api/data/todos", { method: "POST", token: tokenWrite, body: { title: "令牌写" } });
    assert.equal(writePost.status, 200, "读写令牌应能写");
  });

  test("导出结构完整且只含本人数据", async () => {
    const r = await req(BASE, "/api/export", { cookie: cookieA });
    assert.equal(r.status, 200);
    const { data } = r.json;
    for (const key of ["todos", "kb_articles", "job_apps", "ideas"]) {
      assert.ok(Array.isArray(data[key]), `导出应包含 ${key}`);
    }
    for (const [key, rows] of Object.entries(data)) {
      assert.ok(rows.every((row) => row.user_id === 1), `${key} 中不应出现其他用户的数据`);
    }
  });

  test("重启进程后数据仍在（原子落盘）", async () => {
    const beforeCount = (await req(BASE, "/api/data/todos", { cookie: cookieA })).json.rows.length;
    await stopServer(server.child);
    server = startServer({ port: PORT, dataDir });
    await waitHealthy(BASE, server.getStderr);
    const afterCount = (await req(BASE, "/api/data/todos", { cookie: cookieA })).json.rows.length;
    assert.equal(afterCount, beforeCount, "重启后数据条数应保持不变");
  });
});

describe("演示站模式（DEMO_MODE）", () => {
  let dataDir, server;

  before(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), "wb-demo-test-"));
    server = startServer({
      port: DEMO_PORT,
      dataDir,
      env: { DEMO_MODE: "1", DEMO_EMAIL: "demo@test.dev", DEMO_PASSWORD: "demo12345" },
    });
    await waitHealthy(DEMO_BASE, server.getStderr);
  });

  after(async () => {
    await stopServer(server.child);
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("/api/auth/config 暴露演示账号信息", async () => {
    const r = await req(DEMO_BASE, "/api/auth/config");
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.demo, { email: "demo@test.dev", password: "demo12345" });
  });

  test("注册被拒绝 403", async () => {
    const r = await req(DEMO_BASE, "/api/auth/register", {
      method: "POST",
      body: { email: "x@test.dev", password: "secret123" },
    });
    assert.equal(r.status, 403);
  });

  test("API 令牌签发被拒绝 403", async () => {
    const r = await req(DEMO_BASE, "/api/tokens", { method: "POST", body: { name: "x" } });
    assert.equal(r.status, 403);
  });
});

describe("求职看板 B0：批量写入、状态时间戳、事件去重、删简历清文件", () => {
  const P = 3313;
  const B = `http://127.0.0.1:${P}`;
  let dataDir, server, cookie;

  before(async () => {
    dataDir = mkdtempSync(path.join(tmpdir(), "wb-jobs-"));
    server = startServer({ port: P, dataDir });
    await waitHealthy(B, server.getStderr);
    const reg = await req(B, "/api/auth/register", {
      method: "POST",
      body: { email: "jobs@test.dev", password: "secret123" },
    });
    assert.equal(reg.status, 200, reg.text);
    cookie = cookieOf(reg.res);
  });

  after(async () => {
    await stopServer(server.child);
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("批量新增：默认状态与 status_changed_at 由服务端补", async () => {
    const r = await req(B, "/api/data/job_apps/bulk", {
      method: "POST",
      cookie,
      body: {
        rows: [
          { company: "字节跳动", position: "AI 产品经理", tier: "冲刺", city: "北京" },
          { company: "某创业公司", position: "产品实习" },
          { company: "快手", position: "策略产品", batch: "包-2026-11-20" },
        ],
      },
    });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.count, 3);
    assert.ok(r.json.rows.every((x) => x.status === "待投递"), "未填状态应默认待投递");
    assert.ok(r.json.rows.every((x) => x.status_changed_at), "新建应写 status_changed_at");
    assert.equal(r.json.rows[0].user_id, 1);
  });

  test("批量新增超过 200 条应拒绝", async () => {
    const rows = Array.from({ length: 201 }, (_, i) => ({ company: `公司${i}` }));
    const r = await req(B, "/api/data/job_apps/bulk", { method: "POST", cookie, body: { rows } });
    assert.equal(r.status, 400);
  });

  test("批量更新：返回 changed / failed，状态变了才写 rejected_at", async () => {
    const list = await req(B, "/api/data/job_apps", { cookie });
    const ids = list.json.rows.map((x) => x.id);
    const r = await req(B, "/api/data/job_apps/bulk", {
      method: "PATCH",
      cookie,
      body: { ids: [ids[0], ids[1], 99999], patch: { status: "已取消" } },
    });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.changed, 2);
    assert.deepEqual(r.json.failed, [99999]);

    const after = await req(B, "/api/data/job_apps", { cookie });
    const closed = after.json.rows.filter((x) => x.status === "已取消");
    assert.equal(closed.length, 2);
    assert.ok(closed.every((x) => x.rejected_at), "进入已取消应写 rejected_at");

    // 从 closed 改回来要清空 rejected_at
    const back = await req(B, `/api/data/job_apps/${closed[0].id}`, {
      method: "PATCH",
      cookie,
      body: { status: "一面中" },
    });
    assert.equal(back.status, 200, back.text);
    assert.equal(back.json.row.rejected_at, "");
    assert.ok(back.json.row.status_changed_at);
  });

  test("没改状态时不动 status_changed_at", async () => {
    const list = await req(B, "/api/data/job_apps", { cookie });
    const row = list.json.rows.find((x) => x.status === "一面中");
    const r = await req(B, `/api/data/job_apps/${row.id}`, {
      method: "PATCH",
      cookie,
      body: { note: "只改备注" },
    });
    assert.equal(r.json.row.status_changed_at, row.status_changed_at);
  });

  test("进展事件去重：3 秒内同标题只留一条", async () => {
    const list = await req(B, "/api/data/job_apps", { cookie });
    const appId = list.json.rows[0].id;
    const body = { app_id: appId, kind: "投递", title: "BOSS 直聊打招呼" };
    const first = await req(B, "/api/data/job_events", { method: "POST", cookie, body });
    const second = await req(B, "/api/data/job_events", { method: "POST", cookie, body });
    assert.equal(first.status, 200, first.text);
    assert.equal(second.json.deduped, true);
    assert.equal(second.json.row.id, first.json.row.id);

    const events = await req(B, "/api/data/job_events", { cookie });
    assert.equal(events.json.rows.filter((e) => e.app_id === appId).length, 1);
  });

  test("删除简历时顺手删上传文件", async () => {
    const { writeFileSync, existsSync, mkdirSync } = require("node:fs");
    const uploads = path.join(dataDir, "uploads");
    mkdirSync(uploads, { recursive: true });
    const fileName = "resume-test.pdf";
    writeFileSync(path.join(uploads, fileName), "pdf");

    const created = await req(B, "/api/data/resumes", {
      method: "POST",
      cookie,
      body: { name: "测试简历", file_url: `/uploads/${fileName}` },
    });
    assert.equal(created.status, 200, created.text);
    assert.ok(existsSync(path.join(uploads, fileName)));

    const del = await req(B, `/api/data/resumes/${created.json.row.id}`, { method: "DELETE", cookie });
    assert.equal(del.status, 200, del.text);
    await sleep(100);
    assert.equal(existsSync(path.join(uploads, fileName)), false, "文件应被删除");
  });
});
