import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { listRows, insertRow, updateRow, todayStr, fmtDate } from "../api";
import { useLiveReload } from "../live";
import { useAuth } from "../auth";
import { Badge, Button, Checkbox, EmptyState, Loading, Modal, toast } from "../components/ui";
import {
  BookOpen,
  Target,
  CheckSquare,
  Wallet,
  StickyNote,
  ArrowRight,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Settings2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { jobStatusStyle, useJobStatuses } from "../colors";

function StatCard({ icon: Icon, label, value, sub, to }) {
  return (
    <Link
      to={to}
      className="group rounded-xl border border-slate-200/70 bg-white/80 p-4 transition-shadow hover:shadow-soft"
    >
      <div className="mb-2 flex items-center gap-2 text-slate-400">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <div className="flex items-end justify-between">
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
        <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5" />
      </div>
      {sub ? <p className="mt-1 text-[11px] text-slate-400">{sub}</p> : null}
    </Link>
  );
}

function Card({ title, icon: Icon, to, linkText, children }) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-white/80 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Icon className="h-4 w-4 text-slate-400" /> {title}
        </h2>
        <Link to={to} className="text-xs text-slate-400 transition-colors hover:text-terracotta-600">
          {linkText}
        </Link>
      </div>
      {children}
    </div>
  );
}

// ===== 首页板块注册表：顺序与显隐可自定义（settings.dashboard_cards）=====
const DEFAULT_STATS = ["stat_kb", "stat_jobs", "stat_todos", "stat_expenses"];
const DEFAULT_CARDS = ["card_todos", "card_jobs", "card_kb", "card_notes"];

const STAT_DEFS = [
  {
    id: "stat_kb",
    title: "统计 · 知识库文章",
    render: ({ kb, kbThisWeek }) => (
      <StatCard icon={BookOpen} label="知识库文章" value={kb.length} sub={kbThisWeek ? `本周新增 ${kbThisWeek} 篇` : "本周暂无新篇"} to="/kb" />
    ),
  },
  {
    id: "stat_jobs",
    title: "统计 · 进行中求职",
    render: ({ activeJobs, jobs }) => (
      <StatCard icon={Target} label="进行中求职" value={activeJobs.length} sub={jobs.length ? `共投递 ${jobs.length} 家` : "还没有投递记录"} to="/jobs" />
    ),
  },
  {
    id: "stat_todos",
    title: "统计 · 待办事项",
    render: ({ todos, todayTodos }) => (
      <StatCard icon={CheckSquare} label="待办事项" value={todos.filter((t) => !t.done).length} sub={todayTodos.length ? `今日截止 ${todayTodos.length} 项` : "暂无临近截止"} to="/todos" />
    ),
  },
  {
    id: "stat_expenses",
    title: "统计 · 本月支出",
    render: ({ monthExpense, monthExpenses }) => (
      <StatCard icon={Wallet} label="本月支出" value={`¥${monthExpense.toFixed(0)}`} sub={monthExpenses.length ? `本月已记 ${monthExpenses.length} 笔` : "本月还没有记账"} to="/expenses" />
    ),
  },
];

const CARD_DEFS = [
  {
    id: "card_todos",
    title: "今日待办",
    render: ({ todayTodos, today, toggleTodo }) => (
      <Card title="今日待办" icon={CheckSquare} to="/todos" linkText="查看全部">
        {todayTodos.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">今天没有截止的任务 ✓</p>
        ) : (
          <div className="space-y-2.5">
            {todayTodos.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center gap-2.5">
                <Checkbox checked={false} onChange={() => toggleTodo(t)} />
                <span className="flex-1 truncate text-sm text-slate-700">{t.title}</span>
                {t.due_date < today ? (
                  <Badge className="bg-red-50 text-red-500">已过期</Badge>
                ) : (
                  <span className="text-[11px] text-slate-400">{fmtDate(t.due_date)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    ),
  },
  {
    id: "card_jobs",
    title: "求职最新进展",
    render: ({ jobs, styleOf }) => (
      <Card title="求职最新进展" icon={Target} to="/jobs" linkText="查看全部">
        {jobs.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">还没有求职记录</p>
        ) : (
          <div className="space-y-2.5">
            {jobs.slice(0, 4).map((j) => (
              <div key={j.id} className="flex items-center justify-between gap-2">
                <p className="truncate text-sm text-slate-700">
                  {j.company}
                  <span className="ml-1.5 text-xs text-slate-400">{j.position}</span>
                </p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${styleOf(j.status)}`}>
                  {j.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    ),
  },
  {
    id: "card_kb",
    title: "最近沉淀",
    render: ({ kb }) => (
      <Card title="最近沉淀" icon={BookOpen} to="/kb" linkText="进入知识库">
        {kb.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">知识库还是空的，快去写下第一篇</p>
        ) : (
          <div className="space-y-2.5">
            {kb.slice(0, 4).map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2">
                <p className="truncate text-sm text-slate-700">{a.title}</p>
                <Badge>{a.category}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    ),
  },
  {
    id: "card_notes",
    title: "最近随笔记",
    render: ({ notes }) => (
      <Card title="最近随笔记" icon={StickyNote} to="/notes" linkText="去记录">
        {notes.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">想到什么，随手记一条</p>
        ) : (
          <div className="space-y-2.5">
            {notes.slice(0, 4).map((n) => (
              <div key={n.id} className="flex items-center justify-between gap-2">
                <p className="truncate text-sm text-slate-700">{n.title}</p>
                <span className="shrink-0 text-[11px] text-slate-400">{n.ntype}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    ),
  },
];

const statMap = Object.fromEntries(STAT_DEFS.map((d) => [d.id, d]));
const cardMap = Object.fromEntries(CARD_DEFS.map((d) => [d.id, d]));

async function loadDashCfg() {
  try {
    const rows = await listRows("settings");
    const hit = rows.find((r) => r.key === "dashboard_cards");
    const raw = hit?.value;
    const v = typeof raw === "string" ? JSON.parse(raw) : raw || {};
    const pick = (defs, key, fallback) => {
      const arr = Array.isArray(v[key]) ? v[key] : fallback;
      return arr.filter((id) => defs.some((d) => d.id === id));
    };
    return { stats: pick(STAT_DEFS, "stats", DEFAULT_STATS), cards: pick(CARD_DEFS, "cards", DEFAULT_CARDS) };
  } catch {
    return { stats: DEFAULT_STATS, cards: DEFAULT_CARDS };
  }
}

async function saveDashCfg(cfg) {
  const rows = await listRows("settings");
  const hit = rows.find((r) => r.key === "dashboard_cards");
  if (hit) await updateRow("settings", hit.id, { value: JSON.stringify(cfg) });
  else await insertRow("settings", { key: "dashboard_cards", value: JSON.stringify(cfg) });
}

export default function Dashboard() {
  const { styleOf } = useJobStatuses();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [cfg, setCfg] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const today = todayStr();

  const load = async () => {
    try {
      const [kb, todos, expenses, jobs, notes, subs, cfg0] = await Promise.all([
        listRows("kb_articles"),
        listRows("todos"),
        listRows("expenses"),
        listRows("job_apps"),
        listRows("quick_notes"),
        listRows("subs"),
        loadDashCfg(),
      ]);
      setData({ kb, todos, expenses, jobs, notes, subs });
      setCfg(cfg0);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);
  useLiveReload(load);

  const toggleTodo = async (t) => {
    await updateRow("todos", t.id, { done: !t.done });
    load();
  };

  if (error)
    return (
      <Layout>
        <EmptyState icon={Wallet} text={`数据加载失败：${error}`} />
      </Layout>
    );
  if (!data || !cfg)
    return (
      <Layout>
        <Loading />
      </Layout>
    );

  const { kb, todos, expenses, jobs, notes, subs } = data;
  const month = today.slice(0, 7);
  const monthExpenses = expenses.filter((e) => (e.spent_at || "").startsWith(month));
  const monthExpense = monthExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const todayTodos = todos.filter((t) => !t.done && t.due_date && t.due_date <= today);
  const activeJobs = jobs.filter((j) => j.status !== "结束");
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const kbThisWeek = kb.filter((a) => (a.created_at || "").slice(0, 10) >= weekAgo).length;

  // 订阅：快到自动续费、需要去取消的
  const cancelSoon = (subs || []).filter((r) => {
    if (r.status !== "active" || String(r.auto_renew) === "0" || r.cycle === "once" || !r.next_date) return false;
    const days = Math.round((new Date(r.next_date + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
    return days >= 0 && days <= (Number(r.remind_days) || 3);
  });

  const ctx = { kb, todos, expenses, jobs, notes, todayTodos, activeJobs, monthExpenses, monthExpense, kbThisWeek, today, toggleTodo, styleOf };

  const move = (list, i, d) => {
    const n = [...list];
    const j = i + d;
    if (j < 0 || j >= n.length) return n;
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  };

  const EditorGroup = ({ label, defs, keyName }) => {
    const shown = draft[keyName];
    const hidden = defs.filter((d) => !shown.includes(d.id));
    return (
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-500">{label}</p>
        <div className="space-y-1.5">
          {shown.map((id, i) => {
            const d = defs.find((x) => x.id === id);
            return (
              <div key={id} className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-2.5 py-1.5">
                <Checkbox checked onChange={() => setDraft((s) => ({ ...s, [keyName]: s[keyName].filter((x) => x !== id) }))} />
                <span className="flex-1 truncate text-sm text-slate-700">{d.title}</span>
                <button onClick={() => setDraft((s) => ({ ...s, [keyName]: move(s[keyName], i, -1) }))} disabled={i === 0} title="上移" className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setDraft((s) => ({ ...s, [keyName]: move(s[keyName], i, 1) }))} disabled={i === shown.length - 1} title="下移" className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          {hidden.map((d) => (
            <div key={d.id} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 opacity-60">
              <Checkbox checked={false} onChange={() => setDraft((s) => ({ ...s, [keyName]: [...s[keyName], d.id] }))} />
              <span className="flex-1 truncate text-sm text-slate-500">{d.title}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">你好，{user?.nickname || "朋友"} 👋</h1>
          <p className="mt-1 text-sm text-slate-500">今天是 {today}，这里有你的全部动态</p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={() => { setDraft({ stats: [...cfg.stats], cards: [...cfg.cards] }); setEditing(true); }}>
          <Settings2 className="h-4 w-4" /> 自定义
        </Button>
      </div>

      {cancelSoon.length > 0 ? (
        <Link
          to="/subs"
          className="mb-6 flex items-start gap-2.5 rounded-xl border border-terracotta-300 bg-terracotta-50 p-4 transition-colors hover:bg-terracotta-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-600" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-terracotta-700">
              {cancelSoon.length} 个订阅快要自动续费了
            </span>
            <span className="block truncate text-xs text-terracotta-600">
              {cancelSoon.map((r) => r.name).join("、")} —— 只想用一个月的，记得先去取消
            </span>
          </span>
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-400" />
        </Link>
      ) : null}

      {cfg.stats.length > 0 ? (
        <div className={`mb-8 grid grid-cols-2 gap-3 ${cfg.stats.length >= 4 ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
          {cfg.stats.map((id) => (
            <div key={id}>{statMap[id].render(ctx)}</div>
          ))}
        </div>
      ) : null}

      {cfg.cards.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {cfg.cards.map((id) => (
            <div key={id}>{cardMap[id].render(ctx)}</div>
          ))}
        </div>
      ) : null}

      <Modal open={editing} onClose={() => setEditing(false)} title="自定义首页">
        <div className="space-y-4">
          <EditorGroup label="统计卡片" defs={STAT_DEFS} keyName="stats" />
          <EditorGroup label="内容卡片" defs={CARD_DEFS} keyName="cards" />
          <p className="text-[11px] leading-relaxed text-slate-400">
            勾选决定显示与否，箭头决定从上到下的顺序。订阅临期提醒不受这里控制，有临期时始终置顶提示。
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setDraft({ stats: DEFAULT_STATS, cards: DEFAULT_CARDS }); }}>
              恢复默认
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await saveDashCfg(draft);
                  setCfg({ stats: [...draft.stats], cards: [...draft.cards] });
                  setEditing(false);
                  toast.success("首页布局已保存");
                } catch (e) {
                  toast.error("保存失败：" + e.message);
                }
              }}
            >
              保存
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
