import { useEffect, useMemo, useRef, useState } from "react";
import Layout, { PageHeader } from "../components/Layout";
import { listRows, insertRow, updateRow, deleteRow, todayStr, api } from "../api";
import { useLiveReload } from "../live";
import { Button, Input, Label, Checkbox, Modal, Badge, EmptyState, Loading, toast } from "../components/ui";
import { Plus, Trash2, CalendarClock, Clock, MapPin, Repeat, Bell, Sparkles, Grid2x2, Pencil } from "lucide-react";

const PRIORITY_STYLE = {
  高: "bg-red-50 text-red-500",
  中: "bg-amber-50 text-amber-600",
  低: "bg-slate-100 text-slate-500",
};

const REPEATS = [
  { value: "", label: "不重复" },
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
];
const REPEAT_LABEL = Object.fromEntries(REPEATS.map((r) => [r.value, r.label]));

// 四象限：quadrant 可手动指定（q1~q4），空 = 自动推断（优先级高/中=重要，今天到期或过期=紧急）
const QUAD_KEYS = ["q1", "q2", "q3", "q4"];
const QUAD_DEFAULT = {
  q1: "重要且紧急", q2: "重要不紧急", q3: "紧急不重要", q4: "不重要不紧急",
};
const QUAD_TIP = { q1: "立即做", q2: "排期做", q3: "尽快清掉", q4: "有空再做" };
const QUAD_CLS = {
  q1: "border-red-200 bg-red-50/40",
  q2: "border-terracotta-200 bg-terracotta-50/40",
  q3: "border-sky-200 bg-sky-50/40",
  q4: "border-slate-200 bg-slate-50/60",
};
const QUAD_HEAD = { q1: "text-red-500", q2: "text-terracotta", q3: "text-sky-600", q4: "text-slate-500" };

function autoQuadrant(t, today) {
  const urgent = !!t.due_date && t.due_date <= today;
  const important = t.priority === "高" || t.priority === "中";
  if (important && urgent) return "q1";
  if (important && !urgent) return "q2";
  if (!important && urgent) return "q3";
  return "q4";
}
const quadOf = (t, today) => (QUAD_KEYS.includes(t.quadrant) ? t.quadrant : autoQuadrant(t, today));

function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function nextDue(dateStr, repeat) {
  if (!dateStr) return dateStr;
  if (repeat === "daily") return addDays(dateStr, 1);
  if (repeat === "weekly") return addDays(dateStr, 7);
  if (repeat === "monthly") {
    const [y, m, d] = dateStr.split("-").map(Number);
    const nd = new Date(y, m - 1 + 1, 1);
    const lastDay = new Date(nd.getFullYear(), nd.getMonth() + 1, 0).getDate();
    nd.setDate(Math.min(d, lastDay));
    const p = (n) => String(n).padStart(2, "0");
    return `${nd.getFullYear()}-${p(nd.getMonth() + 1)}-${p(nd.getDate())}`;
  }
  return dateStr;
}

/** 到期提醒：页面打开期间每分钟检查一次，每天每条最多提醒一次 */
function useDueReminder(todos) {
  const notifiedRef = useRef({});
  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      // 首次进入页面静默请求权限（浏览器会展示一次授权弹窗）
      Notification.requestPermission().catch(() => {});
    }
    const check = () => {
      if (Notification.permission !== "granted") return;
      const today = todayStr();
      const dayKey = today;
      todos
        .filter((t) => !t.done && t.due_date && t.due_date <= today)
        .forEach((t) => {
          if (notifiedRef.current[t.id] === dayKey) return;
          notifiedRef.current[t.id] = dayKey;
          try {
            new Notification("猫冬手帐 · 待办提醒", {
              body: `${t.due_date < today ? "[已过期] " : ""}${t.title}`,
              tag: `wb-todo-${t.id}`,
            });
          } catch {
            /* ignore */
          }
        });
    };
    check();
    const timer = setInterval(check, 60 * 1000);
    return () => clearInterval(timer);
  }, [todos]);
}

function TodoRow({ t, today, titles, onMove, onToggle, onRemove }) {
  const [menu, setMenu] = useState(false);
  const cur = QUAD_KEYS.includes(t.quadrant) ? t.quadrant : "auto";
  return (
    <div className="group flex items-center gap-3 rounded-lg border border-slate-100 bg-white/80 px-3.5 py-2.5 transition-shadow hover:shadow-soft">
      <Checkbox checked={!!t.done} onChange={() => onToggle(t)} />
      <span className={`flex-1 text-sm ${t.done ? "text-slate-300 line-through" : "text-slate-700"}`}>
        {t.title}
      </span>
      {t.repeat ? (
        <span className="hidden items-center gap-1 text-[11px] text-terracotta-500 sm:flex" title={`重复：${REPEAT_LABEL[t.repeat]}`}>
          <Repeat className="h-3 w-3" /> {REPEAT_LABEL[t.repeat]}
        </span>
      ) : null}
      {t.due_date ? (
        <span className={`hidden items-center gap-1 text-[11px] sm:flex ${!t.done && t.due_date < today ? "font-medium text-red-400" : "text-slate-400"}`}>
          <CalendarClock className="h-3 w-3" /> {t.due_date}
        </span>
      ) : null}
      {t.due_time ? (
        <span className={`hidden items-center gap-1 text-[11px] sm:flex ${!t.done && t.due_date && t.due_date <= today ? "font-medium text-red-400" : "text-slate-400"}`}>
          <Clock className="h-3 w-3" /> {t.due_time}
        </span>
      ) : null}
      {t.location ? (
        <span className="hidden max-w-[10rem] items-center gap-1 truncate text-[11px] text-slate-400 sm:flex" title={t.location}>
          <MapPin className="h-3 w-3 shrink-0" /> {t.location}
        </span>
      ) : null}
      <span className={`rounded-full px-2 py-0.5 text-[11px] ${PRIORITY_STYLE[t.priority] || PRIORITY_STYLE["低"]}`}>
        {t.priority}
      </span>
      <div className="relative">
        <button
          onClick={() => setMenu((m) => !m)}
          title={cur === "auto" ? "放在哪个格子？（当前：自动推断）" : `当前格子：${titles[cur] || QUAD_DEFAULT[cur]}`}
          className={`transition-colors hover:text-terracotta ${menu ? "text-terracotta" : "text-slate-200 group-hover:text-slate-300"}`}
        >
          <Grid2x2 className="h-3.5 w-3.5" />
        </button>
        {menu ? (
          <div onMouseLeave={() => setMenu(false)} className="absolute right-0 top-7 z-30 w-36 rounded-lg border border-slate-100 bg-white p-1 shadow-lg">
            <p className="px-2 pb-1 pt-0.5 text-[10px] text-slate-400">放进哪个格子</p>
            {["", ...QUAD_KEYS].map((q) => {
              const val = q || "auto";
              const label = q ? (titles[q] || QUAD_DEFAULT[q]) : "自动推断";
              return (
                <button
                  key={val}
                  onClick={() => { onMove(t, q); setMenu(false); }}
                  className={`block w-full rounded-md px-2 py-1 text-left text-xs ${cur === val ? "bg-terracotta-50 font-medium text-terracotta" : "text-slate-600 hover:bg-slate-50"}`}
                >
                  {label}{cur === val ? " ✓" : ""}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <button onClick={() => onRemove(t)} className="text-slate-200 transition-colors hover:text-red-400 group-hover:text-slate-300">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function Todos() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("matrix"); // matrix = 四象限 / list = 时间分组
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("中");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [location, setLocation] = useState("");
  const [quad, setQuad] = useState(""); // 添加时选择的格子，空 = 自动推断
  const [repeat, setRepeat] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [titles, setTitles] = useState(QUAD_DEFAULT); // 格子标题（可自定义，存 settings）
  const [titlesId, setTitlesId] = useState(null);
  const [editTitles, setEditTitles] = useState(false);
  const [titlesDraft, setTitlesDraft] = useState(QUAD_DEFAULT);
  // 四象限里就地快速添加：qAdd = 展开的格子 key
  const [qAdd, setQAdd] = useState("");
  const [qTitle, setQTitle] = useState("");
  const [qPri, setQPri] = useState("中");
  const [qSaving, setQSaving] = useState(false);
  const today = todayStr();

  const load = async () => {
    try {
      setTodos(await listRows("todos"));
      const settings = await listRows("settings").catch(() => []);
      const tb = settings.find((s) => s.key === "todo_quad_titles");
      if (tb) {
        setTitlesId(tb.id);
        try {
          setTitles({ ...QUAD_DEFAULT, ...JSON.parse(tb.value || "{}") });
        } catch {
          /* 自定义标题解析失败则用默认 */
        }
      }
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);
  useDueReminder(todos);

  const groups = useMemo(() => {
    const open = todos.filter((t) => !t.done);
    return [
      ["已过期", open.filter((t) => t.due_date && t.due_date < today), true],
      ["今天", open.filter((t) => t.due_date === today), false],
      ["本周", open.filter((t) => t.due_date > today && t.due_date <= addDays(today, 7)), false],
      ["以后", open.filter((t) => !t.due_date || t.due_date > addDays(today, 7)), false],
    ];
  }, [todos, today]);

  // 四象限：手动指定的 quadrant 优先，未指定的按 优先级+截止日期 自动推断
  const quadrants = useMemo(() => {
    const open = todos.filter((t) => !t.done);
    const items = { q1: [], q2: [], q3: [], q4: [] };
    open.forEach((t) => items[quadOf(t, today)].push(t));
    return QUAD_KEYS.map((key) => ({
      key,
      title: titles[key] || QUAD_DEFAULT[key],
      tip: QUAD_TIP[key],
      cls: QUAD_CLS[key],
      head: QUAD_HEAD[key],
      // 象限内按 截止日期 + 时间 排序，没设日期的排最后
      items: [...items[key]].sort((a, b) =>
        String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")) ||
        String(a.due_time || "99:99").localeCompare(String(b.due_time || "99:99"))
      ),
    }));
  }, [todos, today, titles]);
  const doneTodos = useMemo(() => todos.filter((t) => t.done), [todos]);

  const save = async () => {
    if (!title.trim()) return toast.error("请填写任务内容");
    setSaving(true);
    try {
      await insertRow("todos", {
        title: title.trim(),
        priority,
        due_date: dueDate,
        due_time: dueTime,
        location: location.trim(),
        quadrant: quad,
        done: false,
        repeat,
      });
      toast.success("已添加");
      setOpen(false);
      setTitle("");
      setDueDate("");
      setDueTime("");
      setLocation("");
      setQuad("");
      setRepeat("");
      setPriority("中");
      load();
    } catch (e) {
      toast.error("保存失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  // 象限内就地添加：直接落在该格子，默认优先级中
  const addQuick = async (q) => {
    const t = qTitle.trim();
    if (!t) return;
    setQSaving(true);
    try {
      await insertRow("todos", { title: t, priority: qPri, quadrant: q, done: false });
      setQTitle("");
      await load();
      // 保持输入框展开，方便连着加
    } catch (e) {
      toast.error("添加失败：" + e.message);
    } finally {
      setQSaving(false);
    }
  };

  const toggle = async (t) => {
    try {
      await updateRow("todos", t.id, { done: !t.done });
      // 重复任务：完成后自动生成下一期
      if (!t.done && t.repeat && t.due_date) {
        await insertRow("todos", {
          title: t.title,
          priority: t.priority,
          due_date: nextDue(t.due_date, t.repeat),
          due_time: t.due_time || "",
          location: t.location || "",
          quadrant: t.quadrant || "",
          done: false,
          repeat: t.repeat,
        });
        toast.success(`已完成，下一期（${REPEAT_LABEL[t.repeat]}）已生成`);
      }
      load();
    } catch (e) {
      toast.error("更新失败：" + e.message);
    }
  };

  const remove = async (t) => {
    try {
      await deleteRow("todos", t.id);
      load();
    } catch (e) {
      toast.error("删除失败：" + e.message);
    }
  };

  // 手动换格子（q1~q4，空 = 回到自动推断）
  const moveTodo = async (t, q) => {
    if ((t.quadrant || "") === q) return;
    try {
      await updateRow("todos", t.id, { quadrant: q });
      load();
    } catch (e) {
      toast.error("移动失败：" + e.message);
    }
  };

  // 保存自定义格子标题（settings 集合，key = todo_quad_titles）
  const saveTitles = async () => {
    const merged = Object.fromEntries(
      QUAD_KEYS.map((k) => [k, (titlesDraft[k] || "").trim() || QUAD_DEFAULT[k]])
    );
    try {
      const val = JSON.stringify(merged);
      if (titlesId) {
        await updateRow("settings", titlesId, { value: val });
      } else {
        const saved = await insertRow("settings", { key: "todo_quad_titles", value: val });
        setTitlesId(saved.id);
      }
      setTitles(merged);
      setEditTitles(false);
    } catch (e) {
      toast.error("保存失败：" + e.message);
    }
  };

  // 一句话加待办：AI 解析后预填弹窗，确认后保存
  const quickAdd = async () => {
    const t = aiText.trim();
    if (!t) return;
    setAiBusy(true);
    try {
      const r = await api.aiParse(t);
      if (r.action !== "todo" || !r.title) {
        toast.error("没识别出待办，试试「周五前把简历改完」这样的说法");
        return;
      }
      setTitle(r.title);
      setPriority(["高", "中", "低"].includes(r.priority) ? r.priority : "中");
      setDueDate(r.due_date || "");
      setDueTime(/^\d{2}:\d{2}$/.test(r.due_time || "") ? r.due_time : "");
      setLocation(String(r.location || ""));
      setOpen(true);
      setAiText("");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="待办清单"
        subtitle="四象限：格子自己选，不选就自动推断；格子名也能改"
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-white/80 p-0.5">
              {[["matrix", "四象限"], ["list", "列表"]].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-2.5 py-1 text-xs ${view === v ? "bg-terracotta text-white" : "text-slate-500 hover:bg-slate-100"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> 添加待办</Button>
          </div>
        }
      />

      {/* 一句话加待办 */}
      <div className="mb-5 flex items-center gap-2 rounded-xl border border-terracotta-100 bg-terracotta-50/50 p-3">
        <Sparkles className="h-4 w-4 shrink-0 text-terracotta" />
        <input
          value={aiText}
          onChange={(e) => setAiText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && quickAdd()}
          placeholder="一句话加待办：如「明天下午 3 点交周报，高优先级」"
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
        />
        <Button size="sm" onClick={quickAdd} loading={aiBusy}>
          解析
        </Button>
      </div>

      {loading ? (
        <Loading />
      ) : view === "matrix" ? (
        <div className="mb-5">
          <div className="mb-2 flex justify-end">
            <button
              onClick={() => { setTitlesDraft(titles); setEditTitles(true); }}
              className="flex items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-terracotta"
            >
              <Pencil className="h-3 w-3" /> 改格子名
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {quadrants.map((q) => (
            <div key={q.key} className={`rounded-xl border p-3.5 ${q.cls}`}>
              <div className="mb-2.5 flex items-center justify-between">
                <h2 className={`text-xs font-semibold ${q.head}`}>{q.title}</h2>
                <span className="text-[11px] text-slate-400">{q.tip} · {q.items.length}</span>
              </div>
              <div className="space-y-1.5">
                {q.items.length === 0 ? (
                  <p className="py-2 text-center text-[11px] text-slate-300">这一格空着，很清净</p>
                ) : null}
                {q.items.map((t) => <TodoRow key={t.id} t={t} today={today} titles={titles} onMove={moveTodo} onToggle={toggle} onRemove={remove} />)}
                {qAdd === q.key ? (
                  <div className="rounded-lg border border-terracotta-200 bg-white px-2.5 py-2">
                    <input
                      autoFocus
                      value={qTitle}
                      onChange={(e) => setQTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addQuick(q.key);
                        if (e.key === "Escape") { setQAdd(""); setQTitle(""); }
                      }}
                      placeholder={`加到「${q.title}」，回车保存`}
                      className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-300"
                    />
                    <div className="mt-1.5 flex items-center justify-between">
                      <div className="flex gap-1">
                        {["高", "中", "低"].map((p) => (
                          <button
                            key={p}
                            onClick={() => setQPri(p)}
                            className={`rounded px-1.5 py-0.5 text-[10px] ${qPri === p ? "bg-terracotta text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setQAdd(""); setQTitle(""); }} className="text-[11px] text-slate-400 hover:text-slate-600">取消</button>
                        <button onClick={() => addQuick(q.key)} disabled={qSaving} className="text-[11px] font-medium text-terracotta disabled:opacity-50">
                          {qSaving ? "保存中…" : "保存"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setQAdd(q.key); setQTitle(""); }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-200/80 py-1.5 text-[11px] text-slate-400 transition-colors hover:border-terracotta-300 hover:bg-white/60 hover:text-terracotta"
                  >
                    <Plus className="h-3 w-3" /> 加一条
                  </button>
                )}
              </div>
            </div>
          ))}
          </div>
        </div>
      ) : todos.length === 0 ? (
        <EmptyState icon={CalendarClock} text="还没有待办，添加第一条吧" />
      ) : (
        groups.map(([name, items, warn]) =>
          items.length === 0 ? null : (
            <div key={name} className="mb-5">
              <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-400">
                {name} <span className="font-normal">({items.length})</span>
                {warn ? <Badge className="bg-red-50 text-red-500">需要关注</Badge> : null}
              </h2>
              <div className="space-y-1.5">
                {items.map((t) => <TodoRow key={t.id} t={t} today={today} titles={titles} onMove={moveTodo} onToggle={toggle} onRemove={remove} />)}
              </div>
            </div>
          )
        )
      )}

      {doneTodos.length > 0 ? (
        <details className="mb-4 rounded-xl border border-slate-100 bg-white/60 px-3.5 py-2.5">
          <summary className="cursor-pointer text-xs font-semibold text-slate-400">
            已完成 <span className="font-normal">({doneTodos.length})</span>
          </summary>
          <div className="mt-2 space-y-1.5">
            {doneTodos.map((t) => <TodoRow key={t.id} t={t} today={today} titles={titles} onMove={moveTodo} onToggle={toggle} onRemove={remove} />)}
          </div>
        </details>
      ) : null}

      <p className="flex items-center gap-1.5 text-[11px] text-slate-300">
        <Bell className="h-3 w-3" /> 到期提醒通过浏览器通知发送（首次会请求通知权限）；同一账号多端登录时数据实时同步。
      </p>

      <Modal open={open} onClose={() => setOpen(false)} title="添加待办">
        <div className="space-y-4">
          <div>
            <Label>任务内容</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="要做什么？" onKeyDown={(e) => e.key === "Enter" && save()} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>优先级</Label>
              <div className="flex gap-1.5">
                {["高", "中", "低"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`flex-1 rounded-lg py-1.5 text-xs ${
                      priority === p ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>截止日期（可选）</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>具体时间（可选）</Label>
              <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </div>
            <div>
              <Label>地点（可选）</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="如：图书馆、公司" />
            </div>
          </div>
          <div>
            <Label>放到哪个格子</Label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setQuad("")}
                className={`col-span-2 rounded-lg py-1.5 text-xs ${quad === "" ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                自动（按优先级和截止日期推断）
              </button>
              {QUAD_KEYS.map((k) => (
                <button
                  key={k}
                  onClick={() => setQuad(k)}
                  className={`rounded-lg py-1.5 text-xs ${quad === k ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {titles[k] || QUAD_DEFAULT[k]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>重复</Label>
            <div className="flex gap-1.5">
              {REPEATS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRepeat(r.value)}
                  className={`flex-1 rounded-lg py-1.5 text-xs ${
                    repeat === r.value ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {repeat ? (
              <p className="mt-1.5 text-[11px] text-slate-400">
                完成后会自动生成下一期（截止日期按{REPEAT_LABEL[repeat]}顺延，需先设置截止日期）。
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} loading={saving}>添加</Button>
          </div>
        </div>
      </Modal>

      <Modal open={editTitles} onClose={() => setEditTitles(false)} title="改格子名">
        <div className="space-y-3">
          {QUAD_KEYS.map((k) => (
            <div key={k}>
              <Label>{QUAD_DEFAULT[k]}</Label>
              <Input
                value={titlesDraft[k] || ""}
                onChange={(e) => setTitlesDraft({ ...titlesDraft, [k]: e.target.value })}
                placeholder={QUAD_DEFAULT[k]}
              />
            </div>
          ))}
          <p className="text-[11px] text-slate-400">留空恢复默认名字；只是换个说法，格子的位置和颜色不变。</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditTitles(false)}>取消</Button>
            <Button onClick={saveTitles}>保存</Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
