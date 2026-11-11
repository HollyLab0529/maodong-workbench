import { useEffect, useMemo, useState } from "react";
import Layout, { PageHeader } from "../components/Layout";
import { listRows, insertRow, api } from "../api";
import { useLiveReload } from "../live";
import { Button, Textarea, Loading, toast } from "../components/ui";
import MarkdownLite from "../components/MarkdownLite";
import { CalendarRange, Copy, BookOpen, RefreshCw, Sparkles, Eye, PenLine } from "lucide-react";

function ymd(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function startOfWeek(offsetWeeks = 0) {
  const d = new Date();
  const back = (d.getDay() + 6) % 7; // 周一为一周起点
  d.setDate(d.getDate() - back + offsetWeeks * 7);
  return d;
}
function rangeOf(kind) {
  const now = new Date();
  if (kind === "thisWeek") {
    const s = startOfWeek(0);
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    return { start: ymd(s), end: ymd(e), label: "本周" };
  }
  if (kind === "lastWeek") {
    const s = startOfWeek(-1);
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    return { start: ymd(s), end: ymd(e), label: "上周" };
  }
  if (kind === "thisMonth") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: ymd(s), end: ymd(e), label: "本月" };
  }
  const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const e = new Date(now.getFullYear(), now.getMonth(), 0);
  return { start: ymd(s), end: ymd(e), label: "上月" };
}

const PERIODS = [
  { key: "thisWeek", label: "本周" },
  { key: "lastWeek", label: "上周" },
  { key: "thisMonth", label: "本月" },
  { key: "lastMonth", label: "上月" },
];

export default function Report() {
  const [period, setPeriod] = useState("thisWeek");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [mode, setMode] = useState("preview"); // preview=排版预览 / edit=Markdown 源码
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const keys = ["kb_articles", "quick_notes", "todos", "expenses", "job_apps", "job_events", "interviews"];
      const lists = await Promise.all(keys.map((k) => listRows(k).catch(() => [])));
      setData(Object.fromEntries(keys.map((k, i) => [k, lists[i]])));
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  const report = useMemo(() => {
    if (!data) return "";
    const { start, end, label } = rangeOf(period);
    const inRange = (v) => {
      const d = String(v || "").slice(0, 10);
      return d && d >= start && d <= end;
    };

    const kbNew = data.kb_articles.filter((r) => inRange(r.created_at));
    const kbUpdated = data.kb_articles.filter((r) => inRange(r.updated_at) && !inRange(r.created_at));
    const notes = data.quick_notes.filter((r) => inRange(r.created_at));
    const doneTodos = data.todos.filter((r) => r.done && inRange(r.updated_at || r.created_at));
    const overdue = data.todos.filter((r) => !r.done && r.due_date && r.due_date < ymd(new Date()));
    const exps = data.expenses.filter((r) => inRange(r.spent_at));
    const expTotal = exps.reduce((s, r) => s + Number(r.amount || 0), 0);
    const expByCat = Object.entries(
      exps.reduce((m, r) => ({ ...m, [r.category]: (m[r.category] || 0) + Number(r.amount || 0) }), {})
    ).sort((a, b) => b[1] - a[1]);
    const events = data.job_events.filter((r) => inRange(r.event_date));
    const ivs = data.interviews.filter((r) => inRange(r.interview_date));
    const appsTouched = data.job_apps.filter((r) => inRange(r.updated_at));

    const lines = [];
    lines.push(`# ${label}复盘（${start} ~ ${end}）`);
    lines.push("");

    lines.push("## 学习沉淀");
    if (kbNew.length === 0 && kbUpdated.length === 0 && notes.length === 0) {
      lines.push("- 本期没有新增内容");
    } else {
      if (kbNew.length) lines.push(`- 新增知识库文章 ${kbNew.length} 篇：${kbNew.map((r) => r.title).join("、")}`);
      if (kbUpdated.length) lines.push(`- 更新文章 ${kbUpdated.length} 篇：${kbUpdated.map((r) => r.title).join("、")}`);
      if (notes.length) lines.push(`- 随手记 ${notes.length} 条：${notes.slice(0, 5).map((r) => r.title).join("、")}${notes.length > 5 ? " 等" : ""}`);
    }
    lines.push("");

    lines.push("## 求职进展");
    if (events.length === 0 && ivs.length === 0) {
      lines.push("- 本期没有新的求职动态");
    } else {
      events.forEach((e) => {
        const company = data.job_apps.find((a) => a.id === Number(e.app_id))?.company || "";
        lines.push(`- ${company ? company + "：" : ""}${e.title}${e.note ? `（${e.note}）` : ""}`);
      });
      ivs.forEach((i) => {
        const company = i.company || data.job_apps.find((a) => a.id === Number(i.app_id))?.company || "";
        const n = (() => { try { return JSON.parse(i.questions || "[]").length; } catch { return 0; } })();
        lines.push(`- 面试：${company} ${i.round} · ${i.result} · 自评 ${i.rating}/5 · 记录 ${n} 道题`);
      });
      if (!events.length && appsTouched.length) {
        lines.push(`- 在推进：${appsTouched.map((a) => `${a.company}（${a.status}）`).join("、")}`);
      }
    }
    lines.push("");

    lines.push("## 待办");
    if (doneTodos.length === 0) lines.push("- 本期没有完成项");
    else lines.push(`- 完成 ${doneTodos.length} 项：${doneTodos.slice(0, 8).map((t) => t.title).join("、")}${doneTodos.length > 8 ? " 等" : ""}`);
    if (overdue.length) lines.push(`- ⚠️ 仍有 ${overdue.length} 项逾期未完成：${overdue.slice(0, 5).map((t) => t.title).join("、")}`);
    lines.push("");

    lines.push("## 花费");
    if (exps.length === 0) lines.push("- 本期没有记账");
    else {
      lines.push(`- 合计 ¥${expTotal.toFixed(2)}，共 ${exps.length} 笔`);
      if (expByCat.length) lines.push(`- 分类：${expByCat.map(([c, v]) => `${c} ¥${Number(v).toFixed(0)}`).join("、")}`);
    }
    lines.push("");
    lines.push("## 下期计划");
    lines.push("- ");
    return lines.join("\n");
  }, [data, period]);

  useEffect(() => { setText(report); }, [report]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制，可以直接粘到周报里");
    } catch {
      toast.error("复制失败，请手动选中复制");
    }
  };

  // AI 基于真实数据重写（不是润色上面文本，而是后端重新聚合数据后由模型撰写）
  const aiWrite = async () => {
    setAiBusy(true);
    try {
      const days = period.startsWith("this") || period.startsWith("last") ? (period.includes("Week") ? 7 : 30) : 7;
      const { content } = await api.aiWeekly(days);
      setText(content);
      toast.success("AI 已基于本期数据生成，可继续编辑");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAiBusy(false);
    }
  };

  const saveToKb = async () => {
    const { start, end, label } = rangeOf(period);
    setSaving(true);
    try {
      await insertRow("kb_articles", {
        title: `${label}复盘（${start} ~ ${end}）`,
        category: "项目复盘",
        tags: "周报, 复盘",
        content: text,
        updated_at: new Date().toISOString(),
      });
      toast.success("已存入知识库");
    } catch (e) {
      toast.error("保存失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="周报 · 月报"
        subtitle="自动汇总本期学习、求职、待办与花费，可编辑后复制或存入知识库"
        action={
          <Button variant="outline" onClick={load}>
            <RefreshCw className="h-4 w-4" /> 重新汇总
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
              period === p.key
                ? "bg-terracotta font-medium text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {p.label}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-400">
          <CalendarRange className="h-3.5 w-3.5" />
          {(() => { const r = rangeOf(period); return `${r.start} ~ ${r.end}`; })()}
        </span>
      </div>

      {loading ? (
        <Loading />
      ) : (
        <div className="space-y-2">
          {/* 预览 / 编辑切换 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
              <button
                onClick={() => setMode("preview")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
                  mode === "preview" ? "bg-terracotta font-medium text-white" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Eye className="h-3.5 w-3.5" /> 预览
              </button>
              <button
                onClick={() => setMode("edit")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
                  mode === "edit" ? "bg-terracotta font-medium text-white" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <PenLine className="h-3.5 w-3.5" /> 编辑源码
              </button>
            </div>
            <span className="text-[11px] text-slate-400">
              {mode === "preview" ? "复制全文 / 存入知识库用的是 Markdown 原文，排版不受影响" : "改动会实时反映到预览与复制内容里"}
            </span>
          </div>

          {mode === "edit" ? (
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={22} className="font-mono text-[13px]" />
          ) : (
            <div className="min-h-[20rem] rounded-xl border border-slate-200/70 bg-white/80 p-5 md:p-6">
              <MarkdownLite text={text} />
            </div>
          )}

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={aiWrite} loading={aiBusy} title="基于本期真实数据，由 AI 重写成自然语言">
              <Sparkles className="h-4 w-4" /> AI 重写
            </Button>
            <Button variant="outline" onClick={copy}><Copy className="h-4 w-4" /> 复制全文</Button>
            <Button onClick={saveToKb} loading={saving}><BookOpen className="h-4 w-4" /> 存入知识库</Button>
          </div>
          <p className="mt-2 text-right text-[11px] text-slate-300">
            先由规则自动拼成数据草稿，「AI 重写」再基于本期真实数据改写成自然语言；两者都可编辑后存入知识库。
          </p>
        </div>
      )}
    </Layout>
  );
}
