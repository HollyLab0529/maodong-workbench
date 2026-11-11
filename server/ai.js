/**
 * AI 后端地基：OpenAI 兼容代理 + 能力端点 + 用量计量
 * 设计原则：
 *  - 任意 OpenAI 兼容端点（DeepSeek / Kimi / 智谱 / 通义 / Ollama 均可），Key 永不出服务器
 *  - API Key 用 AES-256-GCM 加密落盘（密钥派生自站点 SECRET）
 *  - 配置读写仅限页面登录态（Cookie），开放 API 令牌不可改配置
 *  - 每次调用记录 token 用量与次数，可按日查看
 */
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const AI_TIMEOUT = 90 * 1000;

module.exports = function createAiRouter({ requireAuth, currentUser, read, DATA_DIR, SECRET }) {
  const router = express.Router();
  const CONFIG_FILE = path.join(DATA_DIR, "ai.json");
  const USAGE_FILE = path.join(DATA_DIR, "ai-usage.json");

  // ---------- 加密 ----------
  const aesKey = crypto.createHash("sha256").update(SECRET).digest();
  function encrypt(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
    const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
  }
  function decrypt(blob) {
    try {
      const [iv, tag, enc] = blob.split(".").map((s) => Buffer.from(s, "base64"));
      const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
    } catch {
      return "";
    }
  }

  // ---------- 配置 ----------
  function readConfig() {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    } catch {
      return null;
    }
  }
  function writeConfig(cfg) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  }
  function publicConfig(cfg) {
    if (!cfg) return { enabled: false };
    return {
      enabled: !!cfg.enabled,
      base_url: cfg.base_url || "",
      model: cfg.model || "",
      has_key: !!cfg.key_enc,
      key_hint: cfg.key_enc ? "•••" + decrypt(cfg.key_enc).slice(-4) : "",
      updated_at: cfg.updated_at || null,
    };
  }
  function needModel(res) {
    const cfg = readConfig();
    if (!cfg || !cfg.enabled || !cfg.base_url || !cfg.model) {
      res.status(400).json({
        error: "AI 未配置",
        hint: "到 设置 → AI 助手 填写 OpenAI 兼容端点与模型（如 DeepSeek、Kimi、Ollama 本地模型）",
      });
      return null;
    }
    const key = cfg.key_enc ? decrypt(cfg.key_enc) : "";
    return { ...cfg, key };
  }

  // ---------- 用量 ----------
  function bumpUsage(usage) {
    if (!usage) return;
    const today = new Date().toISOString().slice(0, 10);
    let u = {};
    try {
      u = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
    } catch {
      /* 首次 */
    }
    const d = u[today] || { tokens: 0, calls: 0 };
    d.tokens += Number(usage.total_tokens) || 0;
    d.calls += 1;
    u[today] = d;
    // 只保留 90 天
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    for (const k of Object.keys(u)) if (k < cutoff) delete u[k];
    fs.writeFileSync(USAGE_FILE, JSON.stringify(u));
  }

  // ---------- 上游调用 ----------
  async function callUpstream(cfg, messages, { temperature = 0.7, max_tokens = 2048, stream = false, res = null, signal = null } = {}) {
    const url = cfg.base_url.replace(/\/+$/, "") + "/chat/completions";
    const headers = { "Content-Type": "application/json" };
    if (cfg.key) headers.Authorization = "Bearer " + cfg.key;
    const body = JSON.stringify({ model: cfg.model, messages, temperature, max_tokens, stream });

    const up = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: signal || AbortSignal.timeout(AI_TIMEOUT),
    });

    if (!up.ok) {
      const text = await up.text().catch(() => "");
      let msg = `上游 ${up.status}`;
      try {
        msg = JSON.parse(text)?.error?.message || msg;
      } catch {
        if (text) msg += ": " + text.slice(0, 200);
      }
      throw Object.assign(new Error(msg), { status: up.status === 401 ? 400 : 502 });
    }

    if (stream && res) {
      // SSE 透传：upstream SSE → 客户端 SSE，同时异步累计用量
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const decoder = new TextDecoder();
      const reader = up.body.getReader();
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const dataLines = chunk
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trim());
            for (const d of dataLines) {
              if (d === "[DONE]") {
                res.write("data: [DONE]\n\n");
              } else {
                try {
                  const j = JSON.parse(d);
                  if (j.usage) bumpUsage(j.usage);
                  res.write(`data: ${JSON.stringify(j)}\n\n`);
                } catch {
                  /* 跳过不完整块 */
                }
              }
            }
          }
        }
      } finally {
        res.end();
      }
      return null;
    }

    const data = await up.json();
    bumpUsage(data.usage);
    return data;
  }

  function chatContent(data) {
    return data?.choices?.[0]?.message?.content?.trim() || "";
  }

  // ---------- 配置端点（仅 Cookie 登录态可改） ----------
  router.get("/config", requireAuth, (req, res) => {
    res.json({ config: publicConfig(readConfig()) });
  });

  router.patch("/config", (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: "未登录" });
    const cfg = readConfig() || {};
    const b = req.body || {};
    if (b.base_url !== undefined) cfg.base_url = String(b.base_url).trim().replace(/\/+$/, "");
    if (b.model !== undefined) cfg.model = String(b.model).trim();
    if (b.enabled !== undefined) cfg.enabled = !!b.enabled;
    if (b.key !== undefined) {
      const k = String(b.key).trim();
      if (k === "") delete cfg.key_enc;
      else if (k !== "•••") cfg.key_enc = encrypt(k);
    }
    if (b.clear_key) delete cfg.key_enc;
    // 防呆：开了开关但没填端点，等于没配上，还会盖掉已有配置
    if (cfg.enabled && !cfg.base_url) {
      return res.status(400).json({ error: "启用 AI 前先填 API 端点（如 https://api.deepseek.com/v1）" });
    }
    cfg.updated_at = new Date().toISOString();
    writeConfig(cfg);
    res.json({ config: publicConfig(cfg) });
  });

  router.post("/test", (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: "未登录" });
    const cfg = needModel(res);
    if (!cfg) return;
    const t0 = Date.now();
    callUpstream(cfg, [{ role: "user", content: "回复：连接成功" }], { max_tokens: 10, temperature: 0 })
      .then((data) => res.json({ ok: true, model: cfg.model, latency_ms: Date.now() - t0, sample: chatContent(data) }))
      .catch((e) => res.status(e.status || 502).json({ error: e.message }));
  });

  router.get("/usage", requireAuth, (req, res) => {
    let u = {};
    try {
      u = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
    } catch {
      /* 空 */
    }
    const days = Object.entries(u)
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, 30)
      .map(([date, v]) => ({ date, ...v }));
    res.json({ days, total_tokens: days.reduce((s, d) => s + d.tokens, 0), total_calls: days.reduce((s, d) => s + d.calls, 0) });
  });

  // ---------- 通用对话（前端任意模块可挂 AI） ----------
  router.post("/chat", requireAuth, async (req, res) => {
    const cfg = needModel(res);
    if (!cfg) return;
    const { messages, temperature, max_tokens } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: "messages 不能为空" });
    if (messages.length > 40) return res.status(400).json({ error: "messages 过多（上限 40 条）" });
    const total = messages.reduce((s, m) => s + String(m.content || "").length, 0);
    if (total > 60000) return res.status(400).json({ error: "内容过长（上限约 6 万字符）" });
    try {
      const data = await callUpstream(cfg, messages, { temperature, max_tokens });
      res.json({ content: chatContent(data), usage: data.usage || null });
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message });
    }
  });

  router.post("/chat/stream", requireAuth, async (req, res) => {
    const cfg = needModel(res);
    if (!cfg) return;
    const { messages, temperature, max_tokens } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: "messages 不能为空" });
    try {
      await callUpstream(cfg, messages, { temperature, max_tokens, stream: true, res });
    } catch (e) {
      if (!res.headersSent) res.status(e.status || 502).json({ error: e.message });
      else res.end();
    }
  });

  // ---------- 能力 1：润色（知识库 / 随记） ----------
  router.post("/polish", requireAuth, async (req, res) => {
    const cfg = needModel(res);
    if (!cfg) return;
    const { text, style } = req.body || {};
    if (!text || String(text).length < 5) return res.status(400).json({ error: "text 太短" });
    if (String(text).length > 20000) return res.status(400).json({ error: "text 过长（上限 2 万字符）" });
    const styles = {
      concise: "更精炼：压缩冗余表达，保留全部事实与结论，不新增内容。",
      fluent: "更通顺：理顺语句与段落衔接，保持原意与语气，不改变事实。",
      structured: "更有条理：用小标题或要点重组，突出结论与关键数据，不编造细节。",
    };
    const instruction = styles[style] || styles.fluent;
    try {
      const data = await callUpstream(cfg, [
        { role: "system", content: "你是严谨的中文文字编辑。遵守：保留事实与确定程度；不编造数据、不夸大；直接输出改写后的全文，不要任何解释或前后缀。原文若是 Markdown 则保持 Markdown。" },
        { role: "user", content: `${instruction}\n\n---\n\n${text}` },
      ], { temperature: 0.4 });
      res.json({ content: chatContent(data) });
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message });
    }
  });

  // ---------- 能力 2：摘要 + 标签（知识库） ----------
  router.post("/summarize", requireAuth, async (req, res) => {
    const cfg = needModel(res);
    if (!cfg) return;
    const { text } = req.body || {};
    if (!text || String(text).length < 50) return res.status(400).json({ error: "text 太短，不值得摘要" });
    if (String(text).length > 40000) return res.status(400).json({ error: "text 过长（上限 4 万字符）" });
    try {
      const data = await callUpstream(cfg, [
        { role: "system", content: '你是技术笔记管理员。只输出一个 JSON 对象，不要代码块围栏：{"summary":"80字以内的一句话摘要","points":["要点1","要点2","要点3"],"tags":["标签","不超过5个"],"topics":["涉及的技术/主题"] }。要点 3-6 条，每条不超过 30 字；标签从内容提取，不发明不存在的概念。' },
        { role: "user", content: String(text) },
      ], { temperature: 0.2, max_tokens: 800 });
      const raw = chatContent(data).replace(/^```json?\s*|```\s*$/g, "");
      try {
        res.json(JSON.parse(raw));
      } catch {
        res.json({ summary: raw.slice(0, 200), points: [], tags: [], topics: [] });
      }
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message });
    }
  });

  // ---------- 能力 3：周报 / 月报（聚合真实数据 → LLM） ----------
  router.post("/weekly", requireAuth, async (req, res) => {
    const cfg = needModel(res);
    if (!cfg) return;
    const uid = req.user.id;
    const days = [7, 30, 90].includes(Number(req.body?.days)) ? Number(req.body.days) : 7;
    const now = new Date();
    const start = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);
    const periodName = days === 7 ? "一周" : days === 30 ? "一个月" : "三个月";

    const facts = read((db) => {
      const mine = (c) => db[c].filter((r) => r.user_id === uid);
      const inRange = (r, f = "created_at") => String(r[f] || "").slice(0, 10) >= start;
      const todos = mine("todos");
      const expenses = mine("expenses").filter((e) => (e.spent_at || "") >= start);
      const byCat = {};
      expenses.forEach((e) => (byCat[e.category || "其他"] = (byCat[e.category || "其他"] || 0) + Number(e.amount || 0)));
      const sleeps = mine("sleeps").filter((s) => (s.date || "") >= start);
      const weights = mine("weights").filter((w) => (w.date || "") >= start).map((w) => Number(w.weight)).filter(Boolean);
      return {
        period_start: start,
        period_end: today,
        todos_done: todos.filter((t) => t.done && inRange(t, "updated_at")).length,
        todos_added: todos.filter(inRange).length,
        todos_overdue: todos.filter((t) => !t.done && t.due_date && t.due_date < today).length,
        kb_new: mine("kb_articles").filter(inRange).map((a) => a.title).slice(0, 10),
        notes_new: mine("quick_notes").filter(inRange).length,
        workouts: mine("workouts").filter((w) => (w.date || "") >= start).map((w) => w.part),
        expense_total: Number(expenses.reduce((s, e) => s + Number(e.amount || 0), 0).toFixed(2)),
        expense_top: Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3),
        sleep_avg: sleeps.length ? Number((sleeps.reduce((s, x) => s + Number(x.duration || 0), 0) / sleeps.length).toFixed(1)) : null,
        weight: weights.length ? { first: weights[0], last: weights[weights.length - 1] } : null,
        subs_renew_soon: mine("subs").filter((s) => s.status === "active" && String(s.auto_renew) === "1" && s.next_date && s.next_date >= today && s.next_date <= new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10)).map((s) => s.name),
        job_updates: mine("job_apps").filter(inRange).map((j) => `${j.company}·${j.status}`),
      };
    });

    try {
      const data = await callUpstream(cfg, [
        {
          role: "system",
          content:
            `你是个人助理，基于用户过去${periodName}的真实数据写一份中文回顾。要求：Markdown；分为「## 本期回顾」「## 值得注意」「## 下期建议」三节；回顾只陈述数据里有的事实，可以补充温和的观察；没有数据的维度不要提；不编造任何数字；语气自然简洁，像朋友写的，不用客套开头结尾；全文 300 字以内。`,
        },
        { role: "user", content: `我的数据 JSON：\n${JSON.stringify(facts)}` },
      ], { temperature: 0.5, max_tokens: 1000 });
      res.json({ content: chatContent(data), facts, days });
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message });
    }
  });

  // ---------- 能力 4：自然语言 → 结构化（记账/待办/随记快速捕捉） ----------
  router.post("/parse", requireAuth, async (req, res) => {
    const cfg = needModel(res);
    if (!cfg) return;
    const { text } = req.body || {};
    if (!text || String(text).length > 500) return res.status(400).json({ error: "text 必填且不超过 500 字" });
    const today = new Date().toISOString().slice(0, 10);
    try {
      const data = await callUpstream(cfg, [
        {
          role: "system",
          content:
            `今天是 ${today}。把用户的一句话解析为动作。只输出 JSON，不要围栏：\n` +
            '{"action":"todo|note|expense|none","title":"标题(简短祈使句)","due_date":"YYYY-MM-DD 或省略","due_time":"HH:MM 或省略","priority":"low|medium|high","location":"任务地点(用户明确提到才填)","category":"支出分类","amount":数字,"spent_at":"YYYY-MM-DD","ntype":"灵感|踩坑|待整理","note":"补充"}\n' +
            "规则：不确定 action 时用 none；金额必须正数；相对时间（明天/下周三/月底）换算成具体日期，提到几点（下午3点=15:00）填 due_time；地点只有用户明确提到（如「在图书馆」「去公司」）才填进 location；不要发明用户没说的字段。",
        },
        { role: "user", content: String(text) },
      ], { temperature: 0, max_tokens: 300 });
      const raw = chatContent(data).replace(/^```json?\s*|```\s*$/g, "");
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return res.json({ action: "none", raw });
      }
      res.json(parsed);
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message });
    }
  });

  // ---------- 能力 5：随记整理（乱文字 → 标题 + 分类 + 标签） ----------
  router.post("/tidy-note", requireAuth, async (req, res) => {
    const cfg = needModel(res);
    if (!cfg) return;
    const { text } = req.body || {};
    if (!text || String(text).length < 4) return res.status(400).json({ error: "text 太短" });
    if (String(text).length > 3000) return res.status(400).json({ error: "text 过长（上限 3000 字符）" });
    try {
      const data = await callUpstream(cfg, [
        {
          role: "system",
          content:
            '你是随手记整理员。用户会给你一段随手记下的零散文字（可能是语音转写）。整理为：只输出 JSON，不要围栏：\n' +
            '{"title":"20字以内标题，提炼核心","ntype":"灵感|踩坑|待整理|生活","content":"整理后的正文：保留全部原始信息与口语细节，理顺断句、分段，不删内容不编造","tags":["1-4个标签"]}\n' +
            "ntype 判定：突然想到的点子=灵感；遇到的问题/坑=踩坑；没想清楚的事=待整理；其他=生活。",
        },
        { role: "user", content: String(text) },
      ], { temperature: 0.3, max_tokens: 1000 });
      const raw = chatContent(data).replace(/^```json?\s*|```\s*$/g, "");
      try {
        res.json(JSON.parse(raw));
      } catch {
        res.status(502).json({ error: "模型返回的不是有效 JSON，请重试" });
      }
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message });
    }
  });

  // ---------- 能力 6：采购清单（勾选菜谱 → 合并食材） ----------
  router.post("/shopping-list", requireAuth, async (req, res) => {
    const cfg = needModel(res);
    if (!cfg) return;
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Boolean);
    if (!ids.length) return res.status(400).json({ error: "ids 必填（菜谱 id 数组）" });
    if (ids.length > 20) return res.status(400).json({ error: "一次最多 20 个菜谱" });
    const recipes = read((db) =>
      db.recipes.filter((r) => r.user_id === req.user.id && ids.includes(r.id))
    );
    if (!recipes.length) return res.status(404).json({ error: "没有找到对应菜谱" });
    try {
      const data = await callUpstream(cfg, [
        {
          role: "system",
          content:
            "你是采购助手。用户给你几道菜的菜谱原料（自由文本），合并去重生成一份超市采购清单。只输出 Markdown 无序列表，按「蔬菜 / 肉蛋 / 调料 / 其他」分组（组名加粗，没有的组省略）；每行一条食材，把多道菜共用的数量相加；不用问问题，缺数量的就不写数量。",
        },
        {
          role: "user",
          content: recipes.map((r) => `【${r.title}】${r.ingredients || "（无原料记录）"}`).join("\n\n"),
        },
      ], { temperature: 0.2, max_tokens: 800 });
      res.json({ content: chatContent(data), recipes: recipes.map((r) => r.title) });
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message });
    }
  });

  // ---------- 能力 7：面试复盘归纳 ----------
  router.post("/interview-review", requireAuth, async (req, res) => {
    const cfg = needModel(res);
    if (!cfg) return;
    const { text, company, round } = req.body || {};
    if (!text || String(text).length < 50) return res.status(400).json({ error: "text 太短（至少 50 字，贴面试记录/复盘笔记）" });
    if (String(text).length > 30000) return res.status(400).json({ error: "text 过长（上限 3 万字符）" });
    try {
      const data = await callUpstream(cfg, [
        {
          role: "system",
          content:
            '你是面试教练。基于用户提供的面试记录（可能是复盘笔记或转写稿），只输出 JSON，不要围栏：\n' +
            '{"questions":[{"q":"被问到的问题","topic":"考察方向(如 八股/项目/算法/系统设计/行为)","good":"答得好的点(没有则空字符串)","bad":"暴露的短板(没有则空字符串)"}],"weak_points":["整体短板，1-3条"],"prepare":["下次面试前要准备的3-5件事，具体可执行"]}\n' +
            "要求：questions 提取 3-10 个真实出现的问题，不要虚构没出现的；bad 只依据记录里用户的实际回答判断，记录里没有回答内容的就留空；中文输出。",
        },
        { role: "user", content: `公司：${company || "未提供"}；轮次：${round || "未提供"}\n\n面试记录：\n${text}` },
      ], { temperature: 0.3, max_tokens: 2000 });
      const raw = chatContent(data).replace(/^```json?\s*|```\s*$/g, "");
      try {
        res.json(JSON.parse(raw));
      } catch {
        res.status(502).json({ error: "模型返回的不是有效 JSON，请重试" });
      }
    } catch (e) {
      res.status(e.status || 502).json({ error: e.message });
    }
  });

  return router;
};
