import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { listRows, updateRow, todayStr, fmtDate } from "../api";
import { useLiveReload } from "../live";
import { useAuth } from "../auth";
import { Badge, Checkbox, EmptyState, Loading } from "../components/ui";
import {
  BookOpen,
  Target,
  CheckSquare,
  Wallet,
  StickyNote,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { jobStatusStyle } from "../colors";

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

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const today = todayStr();

  const load = async () => {
    try {
      const [kb, todos, expenses, jobs, notes, subs] = await Promise.all([
        listRows("kb_articles"),
        listRows("todos"),
        listRows("expenses"),
        listRows("job_apps"),
        listRows("quick_notes"),
        listRows("subs"),
      ]);
      setData({ kb, todos, expenses, jobs, notes, subs });
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
  if (!data)
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

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">你好，{user?.nickname || "朋友"} 👋</h1>
        <p className="mt-1 text-sm text-slate-500">今天是 {today}，这里有你的全部动态</p>
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

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={BookOpen} label="知识库文章" value={kb.length} sub={kbThisWeek ? `本周新增 ${kbThisWeek} 篇` : "本周暂无新篇"} to="/kb" />
        <StatCard icon={Target} label="进行中求职" value={activeJobs.length} sub={jobs.length ? `共投递 ${jobs.length} 家` : "还没有投递记录"} to="/jobs" />
        <StatCard icon={CheckSquare} label="待办事项" value={todos.filter((t) => !t.done).length} sub={todayTodos.length ? `今日截止 ${todayTodos.length} 项` : "暂无临近截止"} to="/todos" />
        <StatCard icon={Wallet} label="本月支出" value={`¥${monthExpense.toFixed(0)}`} sub={monthExpenses.length ? `本月已记 ${monthExpenses.length} 笔` : "本月还没有记账"} to="/expenses" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
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
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${jobStatusStyle(j.status)}`}>
                    {j.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

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
      </div>
    </Layout>
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
