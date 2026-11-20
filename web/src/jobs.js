// 求职看板共用的纯逻辑：不依赖 React，四个工作区都从这里取口径。
// 以前这些散在 Board.jsx 里，导致「日历说 3 家、漏斗说 5 家」这类对不上的问题。

export const TIERS = ["冲刺", "主力", "保底"];
export const TIER_TONE = { 冲刺: "rose", 主力: "amber", 保底: "blue" };

export const STATUS_GROUPS = [
  { key: "todo", label: "未投" },
  { key: "applied", label: "已投等消息" },
  { key: "progress", label: "流程中" },
  { key: "closed", label: "结束" },
];

// 与服务端 server/index.js 的 DEFAULT_STATUS_GROUP 保持一致。
// 状态可以在设置里自定义，没写 group 的老配置按这张表推断。
export const DEFAULT_STATUS_GROUP = {
  待投递: "todo",
  简历筛选中: "applied",
  测评中: "applied",
  笔试中: "progress",
  一面中: "progress",
  二面中: "progress",
  三面中: "progress",
  HR面中: "progress",
  Offer: "closed",
  已取消: "closed",
};

export const DEFAULT_STATUS_SHORT = {
  待投递: "待", 简历筛选中: "筛", 测评中: "测", 笔试中: "笔", 一面中: "一",
  二面中: "二", 三面中: "三", HR面中: "HR", Offer: "录", 已取消: "×",
};

export const pad = (n) => String(n).padStart(2, "0");

// 两个日期字符串（YYYY-MM-DD）之间差几天，to - from
export function dayDiff(from, to) {
  const [y1, m1, d1] = String(from || "").split("-").map(Number);
  const [y2, m2, d2] = String(to || "").split("-").map(Number);
  if (!y1 || !y2) return null;
  return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
}

// 距离今天过了几天（正数=过去）
export const daysSince = (dateStr, today) => {
  const d = dayDiff(dateStr, today);
  return d === null ? null : d;
};

const nameOf = (s) => (typeof s === "string" ? s : s?.name);
const cfgOf = (statuses) => (Array.isArray(statuses) ? statuses : []);

// 状态 → 语义组。配置里写了 group 就用配置，否则按默认表推断，未知状态返回空串
export function groupOf(status, statuses) {
  const s = String(status || "").trim();
  if (!s) return "";
  const hit = cfgOf(statuses).find((x) => nameOf(x) === s);
  if (hit?.group) return hit.group;
  return DEFAULT_STATUS_GROUP[s] || "";
}

export function shortOf(status, statuses) {
  const s = String(status || "").trim();
  const hit = cfgOf(statuses).find((x) => nameOf(x) === s);
  if (hit?.short) return hit.short;
  if (DEFAULT_STATUS_SHORT[s]) return DEFAULT_STATUS_SHORT[s];
  return s.slice(0, 2) || "?";
}

// 未知状态原样保留（以前会被塌成「待投递」，自定义状态在列表里直接消失）
export function normalizeStatus(raw, statuses) {
  const s = String(raw || "").trim();
  if (!s) return nameOf(cfgOf(statuses)[0]) || "待投递";
  const names = cfgOf(statuses).map(nameOf).filter(Boolean);
  if (!names.length || names.includes(s)) return s;
  return s;
}

// 还没投出去：语义组是未投，且没填投递日期
export function isPending(a, statuses) {
  return groupOf(a?.status, statuses) === "todo" && !a?.applied_date;
}

export function isClosed(a, statuses) {
  return groupOf(a?.status, statuses) === "closed";
}

export function isApplied(a, statuses) {
  const g = groupOf(a?.status, statuses);
  return g === "applied" || g === "progress" || g === "closed";
}

// 已经投出去还在等结果（不包含已结束）
export function isWaiting(a, statuses) {
  return isApplied(a, statuses) && !isClosed(a, statuses);
}

const CITY_MAIN = ["北京", "天津", "上海"];

// 从自由文本的 location 里抽出主城市，顺便判断是不是多地招聘
export function parseCity(location) {
  const raw = String(location || "");
  const hits = CITY_MAIN.filter((c) => raw.includes(c));
  const multi = hits.length > 1 || /[/、,，]/.test(raw);
  return { city: hits[0] || (raw.trim() ? "其他" : ""), multi, raw: raw.trim() };
}

export function cityOf(a) {
  if (a?.city) return a.city;
  return parseCity(a?.location).city;
}

// 岗位发布时间：7 天内算新岗（优先投），超过 45 天大概率是常驻岗。
// 只认招聘站上真实写的发布时间，抓不到就返回 null（不拿入库时间冒充）。
export function publishInfo(a, today) {
  const d = a?.publish_date;
  if (!d) return null;
  const days = dayDiff(d, today);
  if (days === null) return null;
  return { date: d, days, fresh: days >= 0 && days <= 7, stale: days > 45 };
}

// 投出去多少天了（用于「谁还没理我」排序）
export function appliedDays(a, today) {
  if (!a?.applied_date) return null;
  return dayDiff(a.applied_date, today);
}

// 下一动作到期情况
export function nextActionInfo(a, today) {
  if (!a?.next_action_date) return null;
  const days = dayDiff(today, a.next_action_date);
  return { date: a.next_action_date, days, overdue: days < 0, today: days === 0 };
}

// 一包的体检数字
export function packageStats(apps, today) {
  const list = Array.isArray(apps) ? apps : [];
  const total = list.length;
  const applied = list.filter((a) => isApplied(a, undefined)).length;
  const pending = list.filter((a) => isPending(a, undefined)).length;
  const overdue = list.filter((a) => isPending(a, undefined) && a.plan_date && a.plan_date < today).length;
  const big = list.filter((a) => a.company_type === "大厂").length;
  const small = list.filter((a) => a.company_type === "中小厂").length;
  const fresh = list.filter((a) => publishInfo(a, today)?.fresh).length;
  const stale = list.filter((a) => publishInfo(a, today)?.stale).length;
  const noLink = list.filter((a) => !String(a.link || "").trim()).length;
  return { total, applied, pending, overdue, big, small, fresh, stale, noLink };
}

// 投递纪律体检：宁可只报「确认有问题」的项目，不凑数
export function policyCheck(stats, policy = {}) {
  const issues = [];
  if (!stats || !stats.total) {
    issues.push({ level: "info", text: "这一包还没有岗位" });
    return { ok: true, issues };
  }
  const target = Number(policy.daily_target) || 0;
  if (target && stats.total < target) {
    issues.push({ level: "warn", text: `共 ${stats.total} 家，离今天目标 ${target} 家还差 ${target - stats.total}` });
  }
  const maxBig = Number(policy.big_company_max_per_day) || 0;
  if (maxBig && stats.big > maxBig) {
    issues.push({ level: "warn", text: `大厂 ${stats.big} 家，超过每天上限 ${maxBig}，分两天投` });
  }
  if (stats.stale) {
    issues.push({ level: "info", text: `${stats.stale} 家挂了 45 天以上，大概率是常驻岗，先别占额度` });
  }
  if (stats.noLink) {
    issues.push({ level: "info", text: `${stats.noLink} 家没填投递链接，投的时候要现找` });
  }
  if (stats.overdue) {
    issues.push({ level: "warn", text: `${stats.overdue} 家计划日期已过还没投` });
  }
  return { ok: issues.every((i) => i.level === "info"), issues };
}

// 计划日期排序：今天的排最前，然后按日期先后，没排期的垫底
export function sortByPlan(list, today) {
  return [...list].sort((a, b) => {
    const ka = a.plan_date || "9999-12-31";
    const kb = b.plan_date || "9999-12-31";
    if (ka !== kb) return ka.localeCompare(kb);
    const pa = a.plan_date === today ? 0 : 1;
    const pb = b.plan_date === today ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return String(a.company || "").localeCompare(String(b.company || ""), "zh-CN");
  });
}

// 按批次分组，最近的一包排最前
export function groupByBatch(apps) {
  const map = new Map();
  (apps || []).forEach((a) => {
    const key = String(a.batch || "").trim() || "未分包";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(a);
  });
  return [...map.entries()].sort((x, y) => {
    if (x[0] === "未分包") return 1;
    if (y[0] === "未分包") return -1;
    const dx = x[1][0]?.batch_date || "";
    const dy = y[1][0]?.batch_date || "";
    return dy.localeCompare(dx) || y[0].localeCompare(x[0], "zh-CN");
  });
}

// 表单默认值：新建时盯住「今天这一包」，避免加完在默认视图里找不到
export function newJobDefaults({ today, batch, batchDate, resumeId, statuses }) {
  return {
    company: "", position: "", jd_code: "", location: "", business: "", link: "",
    applied_date: "", plan_date: today, publish_date: "",
    tier: "", batch: batch || `包-${today}`, batch_date: batchDate || today,
    resume_id: resumeId ? String(resumeId) : "",
    status: normalizeStatus("", statuses), note: "",
    city: "", city_multi: "", company_type: "", source: "",
    next_action: "", next_action_date: "",
  };
}

// 从看板生成待办：标题写清公司·岗位·动作，日期默认今天，优先级高。
// 跟进页、今天页、日历统一用这一个函数，别各写各的文案。
export function todoRow(a, action, today) {
  return {
    title: `${a.company}${a.position ? ` · ${a.position}` : ""} ${action}`.trim(),
    notes: `来自求职看板 #${a.id}`,
    priority: "high",
    due_date: today,
    done: false,
  };
}
