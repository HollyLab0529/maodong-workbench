import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout, { PageHeader } from "../components/Layout";
import { listRows, fmtDate } from "../api";
import { useLiveReload } from "../live";
import { EmptyState, Loading } from "../components/ui";
import { History, BookOpen, Target, CheckSquare, Wallet, StickyNote, Flag } from "lucide-react";

const TYPE_STYLE = {
  kb: { icon: BookOpen, label: "知识库", color: "bg-indigo-50 text-indigo-500", route: "/kb" },
  job: { icon: Target, label: "求职", color: "bg-terracotta-50 text-terracotta-600", route: "/jobs" },
  todo: { icon: CheckSquare, label: "待办", color: "bg-emerald-50 text-emerald-500", route: "/todos" },
  expense: { icon: Wallet, label: "记账", color: "bg-amber-50 text-amber-500", route: "/expenses" },
  note: { icon: StickyNote, label: "随笔记", color: "bg-sky-50 text-sky-500", route: "/notes" },
};

function itemOf(type, row) {
  const style = TYPE_STYLE[type];
  let src = "";
  if (type === "kb") {
    src = row.updated_at || row.created_at || "";
    return { ...style, date: src.slice(0, 10), time: src.slice(11, 16), text: row.title, sub: row.category || "" };
  }
  if (type === "job") {
    // 有事件日期用事件日期(无时刻)；否则用创建时间(有时刻)
    src = row.event_date || row.created_at || "";
    return { ...style, date: src.slice(0, 10), time: row.event_date ? "" : src.slice(11, 16), text: row.title, sub: row.note || "" };
  }
  if (type === "todo") {
    src = row.done ? row.updated_at || row.created_at : row.due_date || row.created_at || "";
    return {
      ...style,
      date: src.slice(0, 10),
      time: row.due_date && !row.done ? "" : src.slice(11, 16),
      text: (row.done ? "✔ 完成：" : "📌 待办：") + row.title,
      sub: "",
    };
  }
  if (type === "expense") {
    src = row.spent_at || "";
    return {
      ...style,
      date: src.slice(0, 10),
      time: src.slice(11, 16),
      text: `支出 ¥${Number(row.amount).toFixed(2)} · ${row.category}`,
      sub: row.note || "",
    };
  }
  src = row.created_at || "";
  return { ...style, date: src.slice(0, 10), time: src.slice(11, 16), text: row.title, sub: row.ntype || "" };
}

export default function Timeline() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [kb, jobs, todos, expenses, notes] = await Promise.all([
        listRows("kb_articles").catch(() => []),
        listRows("job_events").catch(() => []),
        listRows("todos").catch(() => []),
        listRows("expenses").catch(() => []),
        listRows("quick_notes").catch(() => []),
      ]);
      const merged = [
        ...kb.map((r) => itemOf("kb", r)),
        ...jobs.map((r) => itemOf("job", r)),
        ...todos.map((r) => itemOf("todo", r)),
        ...expenses.map((r) => itemOf("expense", r)),
        ...notes.map((r) => itemOf("note", r)),
      ]
        .filter((i) => i.date)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.time < b.time ? 1 : a.time > b.time ? -1 : 0))
        .slice(0, 150);
      setItems(merged);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  const grouped = useMemo(() => {
    const map = {};
    items.forEach((i) => {
      (map[i.date] = map[i.date] || []).push(i);
    });
    return Object.entries(map);
  }, [items]);

  return (
    <Layout>
      <PageHeader title="时间线" subtitle="所有模块的动态按日期回看，最近 150 条" />
      {loading ? (
        <Loading />
      ) : grouped.length === 0 ? (
        <EmptyState icon={History} text="还没有任何动态，去各个模块记录点什么吧" />
      ) : (
        <div className="space-y-6 2xl:mx-auto 2xl:max-w-4xl">
          {grouped.map(([date, dayItems]) => (
            <div key={date}>
              <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-400">
                <Flag className="h-3 w-3" /> {fmtDate(date)}
                <span className="font-normal">({dayItems.length})</span>
              </h2>
              <div className="space-y-2 border-l-2 border-slate-100 pl-4">
                {dayItems.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => item.route}
                    className="group flex w-full items-start gap-3 rounded-lg bg-white/60 px-3 py-2 text-left transition-colors hover:bg-white"
                  >
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${item.color}`}>
                      <item.icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-700 group-hover:text-slate-900">{item.text}</span>
                      {item.sub ? (
                        <span className="block truncate text-xs text-slate-400">{String(item.sub).slice(0, 80)}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-300">
                      {item.time ? <span className="mr-1 font-mono text-slate-400">{item.time}</span> : null}
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
