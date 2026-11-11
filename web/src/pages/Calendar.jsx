import { useEffect, useMemo, useState } from "react";
import Layout, { PageHeader } from "../components/Layout";
import { listRows, insertRow, deleteRow, updateRow, todayStr } from "../api";
import { useLiveReload } from "../live";
import { Button, Input, Label, Checkbox, Modal, EmptyState, Loading, toast } from "../components/ui";
import { ChevronLeft, ChevronRight, Cake, Plus, Trash2, CalendarHeart } from "lucide-react";

const WEEK = ["一", "二", "三", "四", "五", "六", "日"];

function pad(n) {
  return String(n).padStart(2, "0");
}
function ymd(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** 月视图网格：周一开头，返回 6 行 × 7 列的日期字符串（空串为占位） */
function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // 周一=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push("");
  for (let d = 1; d <= daysInMonth; d++) cells.push(ymd(year, month, d));
  while (cells.length % 7 !== 0) cells.push("");
  while (cells.length < 42) cells.push("");
  return cells;
}

/** 纪念日是否落在某天（yearly = 每年重复） */
function annOnDay(a, day) {
  if (!a.date) return false;
  if (a.repeat === "yearly") return a.date.slice(5) === day.slice(5);
  return a.date.slice(0, 10) === day;
}

function yearsOf(a, day) {
  if (a.repeat !== "yearly") return null;
  const y = Number(a.date.slice(0, 4));
  const n = Number(day.slice(0, 4)) - y;
  return n > 0 ? n : null;
}

export default function Calendar() {
  const today = todayStr();
  const [cur, setCur] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { y, m: m - 1 };
  });
  const [todos, setTodos] = useState([]);
  const [notes, setNotes] = useState([]);
  const [anns, setAnns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // 选中的日期字符串
  const [annForm, setAnnForm] = useState({ title: "", date: "", repeat: "yearly", note: "" });
  const [addingAnn, setAddingAnn] = useState(false);

  const load = async () => {
    try {
      const [t, n, a] = await Promise.all([listRows("todos"), listRows("quick_notes"), listRows("anniversaries")]);
      setTodos(t);
      setNotes(n);
      setAnns(a);
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  const cells = useMemo(() => monthGrid(cur.y, cur.m), [cur]);

  const byDay = useMemo(() => {
    const map = {};
    const touch = (d) => (map[d] = map[d] || { todos: [], notes: [], anns: [] });
    todos.forEach((t) => {
      const d = String(t.due_date || "").slice(0, 10);
      if (d) touch(d).todos.push(t);
    });
    notes.forEach((n) => {
      const d = String(n.created_at || "").slice(0, 10);
      if (d) touch(d).notes.push(n);
    });
    anns.forEach((a) => {
      if (!a.date) return;
      // yearly：当月内同月日都标上；一次性：仅当天
      if (a.repeat === "yearly") {
        cells.forEach((d) => {
          if (d && annOnDay(a, d)) touch(d).anns.push(a);
        });
      } else {
        touch(a.date.slice(0, 10)).anns.push(a);
      }
    });
    return map;
  }, [todos, notes, anns, cells]);

  // 选中日期的数据（yearly 纪念日按规则匹配）
  const dayDetail = useMemo(() => {
    if (!selected) return null;
    const base = byDay[selected] || { todos: [], notes: [], anns: [] };
    return {
      ...base,
      anns: anns.filter((a) => annOnDay(a, selected)),
    };
  }, [selected, byDay, anns]);

  const shift = (delta) => {
    setCur(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const openDay = (d) => {
    setSelected(d);
    setAnnForm({ title: "", date: d, repeat: "yearly", note: "" });
    setAddingAnn(false);
  };

  const toggleTodo = async (t) => {
    try {
      await updateRow("todos", t.id, { done: !t.done });
      load();
    } catch (e) {
      toast.error("更新失败：" + e.message);
    }
  };

  const addAnn = async () => {
    if (!annForm.title.trim()) return toast.error("给纪念日起个名字吧");
    if (!annForm.date) return toast.error("选个日期");
    try {
      await insertRow("anniversaries", {
        title: annForm.title.trim(),
        date: annForm.date,
        repeat: annForm.repeat,
        note: annForm.note.trim(),
      });
      toast.success("纪念日已添加");
      setAddingAnn(false);
      load();
    } catch (e) {
      toast.error("保存失败：" + e.message);
    }
  };

  const removeAnn = async (a) => {
    if (!window.confirm(`删除纪念日「${a.title}」？`)) return;
    try {
      await deleteRow("anniversaries", a.id);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error("删除失败：" + e.message);
    }
  };

  const monthLabel = `${cur.y} 年 ${cur.m + 1} 月`;
  const upcoming = useMemo(() => {
    // 未来 60 天内的纪念日提醒（含 yearly 的下一次）
    const list = [];
    const base = new Date(today + "T00:00:00");
    for (let i = 0; i <= 60; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      const day = ymd(d.getFullYear(), d.getMonth(), d.getDate());
      anns.forEach((a) => {
        if (annOnDay(a, day)) list.push({ ann: a, day, inDays: i });
      });
    }
    return list.slice(0, 4);
  }, [anns, today]);

  return (
    <Layout>
      <PageHeader
        title="日历"
        subtitle="纪念日、待办和随手记，落在同一个月历上"
        action={
          <Button
            variant="outline"
            onClick={() => {
              const [y, m] = today.split("-").map(Number);
              setCur({ y, m: m - 1 });
              openDay(today);
            }}
          >
            <CalendarHeart className="h-4 w-4" /> 今天
          </Button>
        }
      />

      {loading ? (
        <Loading />
      ) : (
        <div className="space-y-5">
          {/* 未来纪念日提醒条 */}
          {upcoming.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {upcoming.map(({ ann, day, inDays }, i) => (
                <button
                  key={`${ann.id}-${day}-${i}`}
                  onClick={() => openDay(day)}
                  className="flex items-center gap-1.5 rounded-full border border-terracotta-200 bg-terracotta-50 px-3 py-1 text-xs text-terracotta-700 transition-colors hover:bg-terracotta-100"
                >
                  <Cake className="h-3.5 w-3.5" />
                  {ann.title}
                  <span className="text-terracotta-500">
                    {inDays === 0 ? "就是今天" : inDays === 1 ? "明天" : `${inDays} 天后`}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {/* 月历卡片 */}
          <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-soft md:p-5">
            <div className="mb-4 flex items-center justify-between">
              <button onClick={() => shift(-1)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-terracotta-600">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <h2 className="whitespace-nowrap text-base font-semibold text-slate-900 md:text-lg">{monthLabel}</h2>
              <button onClick={() => shift(1)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-terracotta-600">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400">
              {WEEK.map((w) => (
                <div key={w} className="py-1">{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (!day) return <div key={`e${i}`} className="min-h-[64px] rounded-lg md:min-h-[76px]" />;
                const info = byDay[day];
                const isToday = day === today;
                const dayNum = Number(day.slice(8));
                return (
                  <button
                    key={day}
                    onClick={() => openDay(day)}
                    className={`group flex min-h-[64px] flex-col items-start rounded-lg border p-1.5 text-left transition-colors md:min-h-[76px] ${
                      isToday
                        ? "border-terracotta-400 bg-terracotta-50"
                        : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`mb-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                        isToday ? "bg-terracotta font-semibold text-white" : "text-slate-600"
                      }`}
                    >
                      {dayNum}
                    </span>
                    <span className="flex w-full flex-col gap-0.5">
                      {/* 移动端：色点指示（窄格子放不下文字） */}
                      <span className="flex w-full items-center gap-1 md:hidden">
                        {info?.anns?.length ? <span className="h-1.5 w-1.5 rounded-full bg-terracotta" title="纪念日" /> : null}
                        {info?.todos?.length ? <span className="h-1.5 w-1.5 rounded-full bg-slate-500" title="待办" /> : null}
                        {info?.notes?.length ? <span className="h-1.5 w-1.5 rounded-full border border-slate-400 bg-transparent" title="随记" /> : null}
                      </span>
                      {/* 桌面端：文字摘要 */}
                      <span className="hidden w-full flex-col gap-0.5 md:flex">
                        {info?.anns?.length ? (
                          <span className="flex items-center gap-0.5 truncate text-[10px] leading-tight text-terracotta-600">
                            <Cake className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{info.anns[0].title}</span>
                            {info.anns.length > 1 ? <span className="shrink-0">+{info.anns.length - 1}</span> : null}
                          </span>
                        ) : null}
                        {info?.todos?.length ? (
                          <span className="truncate text-[10px] leading-tight text-slate-500">
                            {info.todos.filter((t) => !t.done).length || info.todos.length} 项待办
                          </span>
                        ) : null}
                        {info?.notes?.length ? (
                          <span className="truncate text-[10px] leading-tight text-slate-400">
                            {info.notes.length} 条随记
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 图例：色点含义 */}
          <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-terracotta" />纪念日</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-slate-500" />待办</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full border border-slate-400" />随记</span>
          </div>

          <p className="text-center text-[11px] text-slate-300">点任意一天，看那天的待办、随记和纪念日</p>
        </div>
      )}

      {/* 当日详情 */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected} 的这一天` : ""}>
        {selected && dayDetail ? (
          <div className="space-y-5">
            {/* 纪念日 */}
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <Cake className="h-4 w-4 text-terracotta" /> 纪念日
              </h3>
              {dayDetail.anns.length === 0 ? (
                <p className="text-xs text-slate-400">
                  {addingAnn ? "" : "这天还没有纪念日"}
                </p>
              ) : (
                <div className="space-y-2">
                  {dayDetail.anns.map((a) => {
                    const yrs = yearsOf(a, selected);
                    return (
                      <div key={a.id} className="flex items-center justify-between rounded-lg border border-terracotta-100 bg-terracotta-50 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">
                            {a.title}
                            {yrs ? <span className="ml-1.5 text-xs font-normal text-terracotta-600">第 {yrs} 年</span> : null}
                          </p>
                          {a.note ? <p className="text-xs text-slate-400">{a.note}</p> : null}
                        </div>
                        <button onClick={() => removeAnn(a)} className="shrink-0 rounded p-1 text-slate-300 transition-colors hover:text-red-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {addingAnn ? (
                <div className="mt-2 space-y-2 rounded-lg border border-slate-100 bg-white/70 p-3">
                  <Input
                    value={annForm.title}
                    onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
                    placeholder="纪念日名称，如：领养团团纪念日"
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      className="w-40"
                      value={annForm.date}
                      onChange={(e) => setAnnForm({ ...annForm, date: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setAnnForm({ ...annForm, repeat: annForm.repeat === "yearly" ? "" : "yearly" })}
                      className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                        annForm.repeat === "yearly"
                          ? "bg-terracotta text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {annForm.repeat === "yearly" ? "每年重复" : "仅一次"}
                    </button>
                  </div>
                  <Input
                    value={annForm.note}
                    onChange={(e) => setAnnForm({ ...annForm, note: e.target.value })}
                    placeholder="备注（可选）"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setAddingAnn(false)}>取消</Button>
                    <Button size="sm" onClick={addAnn}>保存</Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => setAddingAnn(true)}>
                  <Plus className="h-3.5 w-3.5" /> 添加纪念日
                </Button>
              )}
            </div>

            {/* 待办 */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">待办</h3>
              {dayDetail.todos.length === 0 ? (
                <p className="text-xs text-slate-400">这天没有安排</p>
              ) : (
                <div className="space-y-1.5">
                  {dayDetail.todos.map((t) => (
                    <div key={t.id} className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2">
                      <Checkbox checked={!!t.done} onChange={() => toggleTodo(t)} />
                      <span className={`flex-1 text-sm ${t.done ? "text-slate-300 line-through" : "text-slate-800"}`}>
                        {t.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-1.5 text-[11px] text-slate-300">去「待办」页添加带截止日期的任务，会出现在这里</p>
            </div>

            {/* 随记 */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">随笔记</h3>
              {dayDetail.notes.length === 0 ? (
                <p className="text-xs text-slate-400">这天没有随手记</p>
              ) : (
                <div className="space-y-2">
                  {dayDetail.notes.map((n) => (
                    <div key={n.id} className="rounded-lg border border-slate-100 bg-white/70 px-3 py-2">
                      <p className="text-xs text-slate-400">
                        {n.ntype || "随手记"}
                        {n.title ? ` · ${n.title}` : ""}
                      </p>
                      {n.content ? (
                        <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">{n.content}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </Layout>
  );
}
