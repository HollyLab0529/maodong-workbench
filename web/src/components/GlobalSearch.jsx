import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  CornerDownLeft,
  Loader2,
  BookOpen,
  StickyNote,
  CheckSquare,
  Target,
  Wallet,
} from "lucide-react";
import { listRows } from "../api";
import { resolveModules } from "../modules";
import { useAuth } from "../auth";

const SOURCES = [
  { coll: "kb_articles", label: "知识库", mod: "kb", route: "/kb", icon: BookOpen, pick: (r) => r.title },
  { coll: "quick_notes", label: "随笔记", mod: "notes", route: "/notes", icon: StickyNote, pick: (r) => r.title },
  { coll: "todos", label: "待办", mod: "todos", route: "/todos", icon: CheckSquare, pick: (r) => r.title },
  { coll: "job_apps", label: "求职", mod: "jobs", route: "/jobs", icon: Target, pick: (r) => `${r.company} · ${r.position || ""}` },
  { coll: "expenses", label: "记账", mod: "expenses", route: "/expenses", icon: Wallet, pick: (r) => `¥${Number(r.amount).toFixed(2)} ${r.note || r.category}` },
];

export default function GlobalSearch({ open, onClose, toggle }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  // 只搜索已启用模块的内容
  const enabledIds = useMemo(() => new Set(resolveModules(user).map((m) => m.id)), [user]);
  const sources = useMemo(() => SOURCES.filter((s) => enabledIds.has(s.mod)), [enabledIds]);

  // ⌘K / Ctrl+K 唤起
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (toggle) toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    setLoading(true);
    let alive = true;
    Promise.all(sources.map((s) => listRows(s.coll).catch(() => [])))
      .then((lists) => {
        if (!alive) return;
        const merged = [];
        lists.forEach((list, i) => {
          list.forEach((r) => merged.push({ src: sources[i], row: r }));
        });
        setRows(merged);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, sources]);

  const results = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return [];
    return rows
      .map(({ src, row }) => {
        const hay = [
          row.title, row.content, row.note, row.company, row.position,
          row.category, row.tags, row.amount, row.due_date, row.spent_at,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const idx = hay.indexOf(kw);
        return idx === -1 ? null : { src, row, score: idx };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score)
      .slice(0, 12);
  }, [rows, q]);

  useEffect(() => setActive(0), [q]);

  const go = (item) => {
    onClose();
    navigate(item.src.route);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-300" />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-slate-300" />
          )}
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索所有模块：文章、笔记、待办、求职、账目…"
            className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === "Enter" && results[active]) go(results[active]);
            }}
          />
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-300">ESC</kbd>
        </div>
        <div className="max-h-[46vh] overflow-y-auto p-1.5">
          {!q.trim() ? (
            <p className="px-3 py-6 text-center text-xs text-slate-300">输入关键词，随时找到任何记录</p>
          ) : results.length === 0 && !loading ? (
            <p className="px-3 py-6 text-center text-xs text-slate-300">没有匹配的内容</p>
          ) : (
            results.map((item, i) => (
              <button
                key={`${item.src.coll}-${item.row.id}`}
                onClick={() => go(item)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                  i === active ? "bg-terracotta-50" : ""
                }`}
              >
                <item.src.icon className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-800">
                    {String(item.src.pick(item.row)).slice(0, 60) || "（无标题）"}
                  </span>
                  <span className="text-[11px] text-slate-400">{item.src.label}</span>
                </span>
                {i === active ? <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-slate-300" /> : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
