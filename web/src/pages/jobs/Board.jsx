import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/Layout";
import { listRows, insertRow, updateRow, deleteRow, todayStr } from "../../api";
import { useLiveReload } from "../../live";
import { Button, Input, Textarea, Label, Modal, EmptyState, Loading, toast, Checkbox } from "../../components/ui";
import {
  Plus, Trash2, Pencil, History, Building2, Link2, MapPin,
  Search, LayoutGrid, CalendarDays, CalendarCheck2, X, List, ChevronDown, ExternalLink,
} from "lucide-react";
import { JOB_STATUSES, JOB_STATUS_TONE, jobStatusStyle, useJobStatuses, toneChip, TONE_FG } from "../../colors";

export const STATUSES = JOB_STATUSES;
export const STATUS_STYLE = Object.fromEntries(JOB_STATUSES.map((s) => [s, jobStatusStyle(s)]));

// 状态定死 10 档，脏数据归一到最接近的档
export function normStatus(raw) {
  const t = String(raw || "").trim();
  if (JOB_STATUSES.includes(t)) return t;
  if (/offer/i.test(t)) return "Offer";
  if (/取消|结束|放弃|挂起|拒绝|淘汰/.test(t)) return "已取消";
  if (/hr\s*面/i.test(t)) return "HR面中";
  if (/三面|终面/.test(t)) return "三面中";
  if (/二面/.test(t)) return "二面中";
  if (/一面|初面/.test(t)) return "一面中";
  if (/笔试/.test(t)) return "笔试中";
  if (/测评|测试/.test(t)) return "测评中";
  if (/简历筛选|筛选中|已投|投递中/.test(t)) return "简历筛选中";
  return "待投递";
}
const STAGE_SHORT = {
  待投递: "待", 简历筛选中: "筛", 测评中: "测", 笔试中: "笔", 一面中: "一",
  二面中: "二", 三面中: "三", HR面中: "HR", Offer: "录", 已取消: "×",
};
const stageOf = (a) => normStatus(a.status);
// 还没投出去：时间维度只统计这些人，已投的不会赖在「今日待投」里
const isPending = (a) => stageOf(a) === "待投递" && !a.applied_date;

// 档位：冲刺 / 主力 / 保底，留空表示未分档
export const TIERS = ["冲刺", "主力", "保底"];
const TIER_TONE = { 冲刺: "rose", 主力: "amber", 保底: "blue" };
const tierStyle = (t) => (TIER_TONE[t] ? toneChip(TIER_TONE[t]) : "");

const EMPTY = {
  company: "", position: "", jd_code: "", location: "", business: "", link: "",
  applied_date: "", plan_date: "", publish_date: "", tier: "", batch: "", resume_id: "", status: "待投递", note: "",
};

const pad = (n) => String(n).padStart(2, "0");
function dayDiff(from, to) {
  const [y1, m1, d1] = String(from).split("-").map(Number);
  const [y2, m2, d2] = String(to).split("-").map(Number);
  return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
}

// 岗位发布时间：7 天内算新岗（优先投），超过 45 天大概率是常驻岗。
// 只认招聘站上真实写的发布时间，抓不到就留空（不拿入库时间冒充）。
function publishInfo(a, today) {
  const d = a.publish_date;
  if (!d) return null;
  const days = dayDiff(d, today);
  return { d, days, fresh: days >= 0 && days <= 7, stale: days > 45 };
}

// 时间维度：只数还没投出去的
const RANGES = [
  { key: "today", label: "今日待投" },
  { key: "overdue", label: "逾期未投" },
  { key: "unscheduled", label: "未排期" },
  { key: "all", label: "全部" },
];
function matchRange(a, range, today) {
  if (range === "all") return true;
  if (!isPending(a)) return false;
  if (range === "today") return a.plan_date === today;
  if (range === "overdue") return !!a.plan_date && a.plan_date < today;
  if (range === "unscheduled") return !a.plan_date;
  return true;
}

export default function Board() {
  const { statuses, styleOf } = useJobStatuses();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [events, setEvents] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [ev, setEv] = useState({ title: "", event_date: "", note: "" });

  // 视图与筛选：支持从地址栏带初始值（#/jobs?view=cards&range=all），作品集嵌入和分享链接用
  // HashRouter 下 query 在 hash 里（如 #/jobs?view=cards），window.location.search 读不到
  const bootQuery = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const bootView = bootQuery.get("view");
  const bootRange = bootQuery.get("range");
  const [view, setView] = useState(() =>
    ["list", "cards", "calendar"].includes(bootView) ? bootView : "list"
  );
  const [range, setRange] = useState(() =>
    ["today", "overdue", "unscheduled", "all"].includes(bootRange) ? bootRange : "today"
  );
  const [stageFilter, setStageFilter] = useState("");
  const [q, setQ] = useState("");
  const [fTier, setFTier] = useState("");
  const [fBatch, setFBatch] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [bulkDate, setBulkDate] = useState("");
  const [statusTarget, setStatusTarget] = useState(null);
  const [dayDetail, setDayDetail] = useState(null);
  const today = todayStr();

  const load = async () => {
    try {
      const [rows, rs] = await Promise.all([listRows("job_apps"), listRows("resumes").catch(() => [])]);
      setApps(rows);
      setResumes(rs);
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  const resumeName = (a) => resumes.find((r) => r.id === Number(a.resume_id))?.name || "";

  // 搜索 / 状态 / 档位 / 批次 先过一遍，时间范围的计数基于这一步的结果，保证数字与点进去看到的一致
  const base = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return apps.filter((a) => {
      if (fTier && (a.tier || "") !== fTier) return false;
      if (fBatch && (a.batch || "") !== fBatch) return false;
      if (!kw) return true;
      return [a.company, a.position, a.jd_code, a.location, a.business, a.note]
        .some((v) => String(v || "").toLowerCase().includes(kw));
    });
  }, [apps, q, fTier, fBatch]);

  // 时间卡计数基于「搜索 / 档位 / 批次」过滤后的结果，与点进去看到的数字一致
  const counts = useMemo(
    () => Object.fromEntries(RANGES.map((r) => [r.key, base.filter((a) => matchRange(a, r.key, today)).length])),
    [base, today]
  );
  // 状态卡计数：不受时间维度影响，看的是全量里各档有多少人
  const stageCounts = useMemo(() => {
    const map = Object.fromEntries(JOB_STATUSES.map((n) => [n, 0]));
    base.forEach((a) => { map[stageOf(a)] = (map[stageOf(a)] || 0) + 1; });
    return map;
  }, [base]);

  const shown = useMemo(() => {
    const rows = base
      .filter((a) => matchRange(a, range, today))
      .filter((a) => !stageFilter || stageOf(a) === stageFilter);
    return rows.sort((a, b) => {
      const ka = a.applied_date ? "9999-99-99" : a.plan_date || "9999-98-98";
      const kb = b.applied_date ? "9999-99-99" : b.plan_date || "9999-98-98";
      return ka.localeCompare(kb) || String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
  }, [base, range, stageFilter, today]);

  const batchOptions = useMemo(
    () => Array.from(new Set(apps.map((a) => a.batch).filter(Boolean))).sort(),
    [apps]
  );

  const hasFilter = !!(stageFilter || fTier || fBatch || q.trim());

  const openNew = () => {
    setForm({
      ...EMPTY,
      resume_id: resumes.find((r) => r.in_use) ? String(resumes.find((r) => r.in_use).id) : "",
      plan_date: range === "unscheduled" ? today : "",
    });
    setEditingId(null);
    setFormOpen(true);
  };
  const openEdit = (a) => {
    setForm({
      company: a.company || "", position: a.position || "", jd_code: a.jd_code || "",
      location: a.location || "", business: a.business || "", link: a.link || "",
      applied_date: a.applied_date || "", plan_date: a.plan_date || "",
      publish_date: a.publish_date || "",
      tier: a.tier || "", batch: a.batch || "",
      resume_id: a.resume_id ? String(a.resume_id) : "",
      status: normStatus(a.status), note: a.note || "",
    });
    setEditingId(a.id);
    setFormOpen(true);
  };

  // 首页直达：/jobs?id=xx 自动打开对应投递的详情面板
  const [sp, setSp] = useSearchParams();
  useEffect(() => {
    const id = sp.get("id");
    if (!id || loading) return;
    const a = apps.find((x) => String(x.id) === id);
    if (a) setDetail(a);
    setSp({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, apps]);

  const save = async () => {
    if (!form.company.trim()) return toast.error("请填写公司名");
    setSaving(true);
    try {
      const payload = {
        company: form.company.trim(),
        position: form.position.trim(),
        jd_code: form.jd_code.trim(),
        location: form.location.trim(),
        business: form.business.trim(),
        link: form.link.trim(),
        applied_date: form.applied_date,
        plan_date: form.plan_date,
        publish_date: form.publish_date || "",
        tier: form.tier,
        batch: form.batch.trim(),
        resume_id: form.resume_id || "",
        status: form.status,
        note: form.note.trim(),
        updated_at: new Date().toISOString(),
      };
      if (editingId) {
        await updateRow("job_apps", editingId, payload);
        toast.success("已更新");
      } else {
        await insertRow("job_apps", payload);
        toast.success("已添加");
      }
      setFormOpen(false);
      load();
    } catch (e) {
      toast.error("保存失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a) => {
    if (!window.confirm(`确定删除「${a.company}」的记录？`)) return;
    try {
      await deleteRow("job_apps", a.id);
      toast.success("已删除");
      setDetail(null);
      setSel((prev) => {
        const next = new Set(prev);
        next.delete(a.id);
        return next;
      });
      load();
    } catch (e) {
      toast.error("删除失败：" + e.message);
    }
  };

  const openDetail = async (a) => {
    setDetail(a);
    setEv({ title: "", event_date: "", note: "" });
    try {
      const all = await listRows("job_events");
      setEvents(all.filter((e) => Number(e.app_id) === a.id).reverse());
    } catch {
      setEvents([]);
    }
  };

  const [evSaving, setEvSaving] = useState(false);
  const addEvent = async () => {
    if (evSaving) return; // 防双击重复提交（曾同一秒写入两条相同记录）
    if (!ev.title.trim()) return toast.error("请填写进展内容");
    setEvSaving(true);
    try {
      await insertRow("job_events", {
        app_id: detail.id,
        title: ev.title.trim(),
        event_date: ev.event_date || "",
        note: ev.note.trim(),
      });
      toast.success("已记录进展");
      openDetail(detail);
    } catch (e) {
      toast.error("保存失败：" + e.message);
    } finally {
      setEvSaving(false);
    }
  };

  const changeStatus = async (a, status) => {
    try {
      await updateRow("job_apps", a.id, { status, updated_at: new Date().toISOString() });
      load();
      if (detail && detail.id === a.id) setDetail({ ...detail, status });
    } catch (e) {
      toast.error("更新失败：" + e.message);
    }
  };

  // 列表里的状态胶囊：选一档就存，进到「待投递」以外自动补投递日期
  const pickStatus = async (a, status) => {
    const patch = { status, updated_at: new Date().toISOString() };
    if (status === "待投递") patch.applied_date = "";
    else if (!a.applied_date) patch.applied_date = today;
    try {
      await updateRow("job_apps", a.id, patch);
      setStatusTarget(null);
      if (detail && detail.id === a.id) setDetail({ ...detail, ...patch });
      load();
    } catch (e) {
      toast.error("更新失败：" + e.message);
    }
  };

  // ===== 批量操作 =====
  const toggleSel = (id) => setSel((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // 单条标记已投：填投递日期并把状态推进一步
  const markApplied = async (a) => {
    const next = { applied_date: today, status: stageOf(a) === "待投递" ? "简历筛选中" : stageOf(a) };
    try {
      await updateRow("job_apps", a.id, { ...next, updated_at: new Date().toISOString() });
      toast.success("已标记为已投");
      setDetail({ ...a, ...next });
      load();
    } catch (e) {
      toast.error("更新失败：" + e.message);
    }
  };

  const bulkApply = async (patch, tip) => {
    if (!sel.size) return;
    setSaving(true);
    try {
      const stamp = new Date().toISOString();
      for (const id of sel) await updateRow("job_apps", id, { ...patch, updated_at: stamp });
      toast.success(tip || `已更新 ${sel.size} 条`);
      setSel(new Set());
      setDetail(null);
      load();
    } catch (e) {
      toast.error("批量更新失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  // 批量标记已投：填投递日期，状态还在起点的自动前进一步，已在流程中的不动（避免把一面中重置回筛选中）
  const bulkMarkApplied = async () => {
    if (!sel.size) return;
    setSaving(true);
    try {
      const stamp = new Date().toISOString();
      for (const id of sel) {
        const a = apps.find((x) => x.id === id);
        if (!a) continue;
        const stage = stageOf(a);
        await updateRow("job_apps", id, {
          applied_date: today,
          status: stage === "待投递" ? "简历筛选中" : stage,
          updated_at: stamp,
        });
      }
      toast.success(`已标记 ${sel.size} 家为已投`);
      setSel(new Set());
      setDetail(null);
      load();
    } catch (e) {
      toast.error("批量更新失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  // ===== 卡片上的计划日期徽标 =====
  const planBadge = (a) => {
    if (a.applied_date) {
      return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">已投 {String(a.applied_date).slice(5)}</span>;
    }
    if (!a.plan_date) return null;
    const diff = dayDiff(today, a.plan_date);
    if (diff === 0) {
      return <span className="rounded-full bg-terracotta px-2 py-0.5 text-[11px] font-medium text-white">今天投</span>;
    }
    if (diff < 0) {
      return <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-500">逾期 {-diff} 天</span>;
    }
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">计划 {String(a.plan_date).slice(5)}</span>;
  };

  // 列表视图的计划列：已投看已投日期，没投的按今天 / 逾期上色
  const planCell = (a) => {
    if (a.applied_date) {
      return <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">已投 {String(a.applied_date).slice(5)}</span>;
    }
    if (!a.plan_date) return <span className="text-slate-300">未排期</span>;
    const diff = dayDiff(today, a.plan_date);
    const cls = diff === 0
      ? "bg-terracotta text-white"
      : diff < 0
        ? "bg-red-50 text-red-500"
        : "bg-slate-100 text-slate-500";
    return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ${cls}`}>{String(a.plan_date).slice(5)}</span>;
  };

  // ===== 日历视图 =====
  const [cursor, setCursor] = useState(() => today.slice(0, 7));
  const calCells = useMemo(() => {
    const [y, m] = cursor.split("-").map(Number);
    const firstWeekday = (new Date(y, m - 1, 1).getDay() + 6) % 7; // 周一为 0
    const days = new Date(y, m, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
    for (let d = 1; d <= days; d += 1) cells.push(`${y}-${pad(m)}-${pad(d)}`);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);
  const byPlanDate = useMemo(() => {
    const map = {};
    base.forEach((a) => {
      if (!a.plan_date) return;
      (map[a.plan_date] = map[a.plan_date] || []).push(a);
    });
    return map;
  }, [base]);
  const shiftMonth = (n) => {
    const [y, m] = cursor.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setCursor(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };

  return (
    <>
      <PageHeader
        title="求职看板"
        subtitle={
          counts.today || counts.overdue
            ? `今天要投 ${counts.today} 家${counts.overdue ? ` · 还有 ${counts.overdue} 家逾期没投` : ""}`
            : "追踪每家公司的流程与时间线"
        }
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
              <button
                onClick={() => setView("list")}
                title="列表视图"
                className={`rounded-md px-2 py-1.5 ${view === "list" ? "bg-terracotta text-white" : "text-slate-400 hover:bg-slate-50"}`}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView("cards")}
                title="卡片视图"
                className={`rounded-md px-2 py-1.5 ${view === "cards" ? "bg-terracotta text-white" : "text-slate-400 hover:bg-slate-50"}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView("calendar")}
                title="日历视图"
                className={`rounded-md px-2 py-1.5 ${view === "calendar" ? "bg-terracotta text-white" : "text-slate-400 hover:bg-slate-50"}`}
              >
                <CalendarDays className="h-4 w-4" />
              </button>
            </div>
            <Button onClick={openNew}><Plus className="h-4 w-4" /> 添加公司</Button>
          </div>
        }
      />

      {/* 时间维度：只数还没投出去的，点卡片筛选、再点一次回全部 */}
      <div className="mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {RANGES.map((r) => {
          const active = range === r.key && !stageFilter;
          const n = r.key === "all" ? base.length : (counts[r.key] || 0);
          const hot = r.key === "today" && n > 0;
          return (
            <button
              key={r.key}
              onClick={() => {
                setStageFilter("");
                setRange(r.key === "all" ? "all" : range === r.key ? "all" : r.key);
              }}
              className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                active
                  ? "border-terracotta bg-terracotta text-white shadow-sm"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <span className={`block text-[11px] ${active ? "text-white/80" : "text-slate-400"}`}>{r.label}</span>
              <span
                className={`block text-xl font-semibold leading-tight ${
                  active ? "text-white" : hot ? "text-terracotta-600" : "text-slate-800"
                }`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* 流程漏斗：状态定死 10 档，点一档只看这档 */}
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-[11px] font-medium text-slate-500">流程漏斗</span>
        <span className="text-[11px] text-slate-300">点一档只看这档，再点取消</span>
      </div>
      <div className="mb-1.5 grid grid-cols-5 gap-1.5 lg:grid-cols-10">
        {JOB_STATUSES.map((name) => {
          const n = stageCounts[name] || 0;
          const active = stageFilter === name;
          return (
            <button
              key={name}
              onClick={() => {
                const next = active ? "" : name;
                setStageFilter(next);
                if (next) setRange("all");
              }}
              className={`rounded-lg border px-2 py-1.5 text-left transition-colors ${
                active
                  ? "border-terracotta bg-terracotta-50"
                  : n
                    ? "border-slate-200 bg-white hover:border-slate-300"
                    : "border-slate-100 bg-slate-50/60"
              }`}
            >
              <span className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${TONE_FG[JOB_STATUS_TONE[name]]}`} />
                <span
                  className={`truncate text-[11px] ${
                    active ? "font-medium text-terracotta-700" : n ? "text-slate-500" : "text-slate-300"
                  }`}
                >
                  {name}
                </span>
              </span>
              <span
                className={`block text-base font-semibold leading-tight ${
                  active ? "text-terracotta-700" : n ? "text-slate-800" : "text-slate-300"
                }`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>
      {/* 漏斗总览：一条按各档人数占比切开的色条 */}
      <div className="mb-3 flex h-1.5 overflow-hidden rounded-full bg-slate-100">
        {JOB_STATUSES.map((name) => {
          const n = stageCounts[name] || 0;
          if (!n) return null;
          return (
            <span
              key={name}
              title={`${name} ${n}`}
              className={`bg-current ${TONE_FG[JOB_STATUS_TONE[name]]}`}
              style={{ width: `${(n / (base.length || 1)) * 100}%` }}
            />
          );
        })}
      </div>

      {/* 二级筛选 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜公司 / 岗位 / JD 编号 / 地点"
            className="pl-8"
          />
        </div>
        <select
          value={fTier}
          onChange={(e) => setFTier(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600 outline-none focus:border-terracotta"
        >
          <option value="">全部档位</option>
          {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {batchOptions.length ? (
          <select
            value={fBatch}
            onChange={(e) => setFBatch(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600 outline-none focus:border-terracotta"
          >
            <option value="">全部批次</option>
            {batchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        ) : null}
        {hasFilter ? (
          <button
            onClick={() => { setQ(""); setStageFilter(""); setFTier(""); setFBatch(""); }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" /> 清空筛选
          </button>
        ) : null}
      </div>

      {loading ? (
        <Loading />
      ) : view === "calendar" ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button onClick={() => shiftMonth(-1)} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">‹</button>
              <span className="text-sm font-medium text-slate-700">{cursor.replace("-", " 年 ")} 月</span>
              <button onClick={() => shiftMonth(1)} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">›</button>
            </div>
            <button onClick={() => setCursor(today.slice(0, 7))} className="rounded px-2 py-1 text-xs text-terracotta-600 hover:bg-terracotta-50">
              回到本月
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400">
            {["一", "二", "三", "四", "五", "六", "日"].map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calCells.map((date, i) => {
              if (!date) return <div key={`e${i}`} className="min-h-[64px] rounded-lg bg-slate-50/40" />;
              const list = byPlanDate[date] || [];
              const isToday = date === today;
              // 一个徽章 = 一个状态，颜色就是这一档的 tone，不再画一坨小竖条
              const tally = {};
              list.forEach((a) => { const k = stageOf(a); tally[k] = (tally[k] || 0) + 1; });
              const shownStages = JOB_STATUSES.filter((n) => tally[n]);
              const allDone = list.length > 0 && !list.some((a) => isPending(a));
              return (
                <button
                  key={date}
                  onClick={() => (list.length ? setDayDetail(date) : null)}
                  className={`min-h-[64px] rounded-lg border p-1 text-left transition-colors ${
                    isToday ? "border-terracotta/50 bg-terracotta-50/40" : "border-slate-100 bg-white"
                  } ${list.length ? "hover:border-slate-300" : "cursor-default"}`}
                >
                  <div className={`mb-0.5 flex items-center gap-0.5 text-[11px] ${isToday ? "font-semibold text-terracotta-600" : "text-slate-400"}`}>
                    {Number(date.slice(8))}
                    {allDone ? <span className="text-[10px] text-slate-300">✓</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-0.5">
                    {shownStages.slice(0, 3).map((n) => (
                      <span
                        key={n}
                        title={`${n} ${tally[n]} 个`}
                        className={`rounded px-1 text-[10px] font-semibold leading-4 ${styleOf(n)}`}
                      >
                        {tally[n]}{STAGE_SHORT[n]}
                      </span>
                    ))}
                    {shownStages.length > 3 ? (
                      <span className="px-0.5 text-[10px] leading-4 text-slate-400">+{shownStages.length - 3}</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
          {counts.unscheduled ? (
            <button
              onClick={() => setRange("unscheduled")}
              className="mt-2 text-xs text-slate-400 hover:text-terracotta-600"
            >
              还有 {counts.unscheduled} 家没排投递日期，点这里去排 →
            </button>
          ) : null}
        </div>
      ) : view === "list" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 text-[11px] text-slate-400">
                <tr>
                  <th className="w-8 px-2 py-2" />
                  <th className="px-2 py-2 font-medium">公司 / 岗位</th>
                  <th className="px-2 py-2 font-medium">城市</th>
                  <th className="px-2 py-2 font-medium">发布</th>
                  <th className="px-2 py-2 font-medium">档位</th>
                  <th className="px-2 py-2 font-medium">计划</th>
                  <th className="px-2 py-2 font-medium">状态</th>
                  <th className="px-2 py-2 font-medium">链接</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="text-xs">
                {shown.map((a) => {
                  const pi = publishInfo(a, today);
                  return (
                  <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-2 py-2 align-middle">
                      <Checkbox checked={sel.has(a.id)} onChange={() => toggleSel(a.id)} />
                    </td>
                    <td className="px-2 py-2">
                      <button onClick={() => openDetail(a)} className="block max-w-[260px] truncate text-left">
                        <span className="font-medium text-slate-800">{a.company}</span>
                        <span className="text-slate-400"> · {a.position || "岗位未填"}</span>
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-slate-500">{a.location || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {pi ? (
                        <span
                          title={pi.stale ? `发布 ${pi.days} 天，可能是常驻岗` : `已发布 ${pi.days} 天`}
                          className={`text-[11px] ${pi.fresh ? "text-terracotta-600" : pi.stale ? "text-amber-600/80" : "text-slate-500"}`}
                        >
                          {String(pi.d).slice(5)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {a.tier ? (
                        <span className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] ${tierStyle(a.tier)}`}>{a.tier}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">{planCell(a)}</td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => setStatusTarget(a)}
                        title="点这里改状态"
                        className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ${styleOf(stageOf(a))}`}
                      >
                        {stageOf(a)}
                        <ChevronDown className="h-3 w-3 opacity-60" />
                      </button>
                    </td>
                    <td className="px-2 py-2">
                      {a.link ? (
                        <a
                          href={a.link}
                          target="_blank"
                          rel="noreferrer"
                          title="打开岗位详情页"
                          className="inline-flex text-terracotta-600 hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="text-amber-600" title="还没有岗位详情页链接">⚠</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isPending(a) ? (
                        <button
                          onClick={() => markApplied(a)}
                          className="whitespace-nowrap rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500 hover:border-terracotta hover:text-terracotta-600"
                        >
                          标记已投
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={range === "today" ? CalendarCheck2 : Building2}
          text={
            apps.length === 0
              ? "还没有求职记录，添加第一家吧"
              : range === "today"
                ? `今天没有排投递${counts.unscheduled ? `，还有 ${counts.unscheduled} 家没排日期，去「未排期」里挑几家定在今天` : ""}`
                : "这个筛选下没有记录"
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((a) => {
            const checked = sel.has(a.id);
            const pi = publishInfo(a, today);
            return (
              <div
                key={a.id}
                className={`cursor-pointer rounded-xl border bg-white p-4 transition-shadow hover:shadow-soft ${
                  checked ? "border-terracotta/60 ring-1 ring-terracotta/20" : "border-slate-200"
                }`}
                onClick={() => openDetail(a)}
              >
                <div className="mb-2 flex items-start gap-2">
                  <span onClick={(e) => e.stopPropagation()} className="mt-0.5 shrink-0">
                    <Checkbox checked={checked} onChange={() => toggleSel(a.id)} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium text-slate-900">{a.company}</h3>
                    <p className="truncate text-xs text-slate-400">
                      {a.position || "岗位未填"}
                      {a.jd_code ? ` · JD ${a.jd_code}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${styleOf(stageOf(a))}`}>
                    {stageOf(a)}
                  </span>
                </div>
                <p className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                  {planBadge(a)}
                  {a.tier ? <span className={`rounded-full px-2 py-0.5 ${tierStyle(a.tier)}`}>{a.tier}</span> : null}
                  {a.batch ? <span className="rounded-full bg-slate-50 px-2 py-0.5 text-slate-400">{a.batch}</span> : null}
                  {a.location ? <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{a.location}</span> : null}
                  {pi ? (
                    <span
                      title={pi.stale ? `发布 ${pi.days} 天，可能是常驻岗` : `已发布 ${pi.days} 天`}
                      className={`inline-flex items-center gap-0.5 ${pi.fresh ? "text-terracotta-600" : pi.stale ? "text-amber-600/80" : ""}`}
                    >
                      <CalendarDays className="h-3 w-3" />发布 {String(pi.d).slice(5)}
                    </span>
                  ) : null}
                  {a.business ? <span>{a.business}</span> : null}
                </p>
                {(a.link) ? (
                  <p className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                    <a
                      href={a.link}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-0.5 text-terracotta-600 hover:underline"
                    >
                      <Link2 className="h-3 w-3" /> 投递链接
                    </a>
                  </p>
                ) : null}
                {a.note ? <p className="mb-2 line-clamp-2 text-xs text-slate-500">{a.note}</p> : null}
                <div className="flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {statuses.map((s) => (
                    <button
                      key={s}
                      onClick={() => changeStatus(a, s)}
                      title={stageOf(a) === s ? "当前状态" : `改为「${s}」`}
                      className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                        stageOf(a) === s
                          ? "font-medium " + styleOf(s)
                          : "text-slate-400 hover:bg-slate-100"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 批量操作浮条 */}
      {sel.size ? (
        <div className="fixed bottom-4 left-1/2 z-40 flex w-[min(92vw,560px)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-xl">
          <span className="text-xs font-medium text-slate-700">已选 {sel.size} 家</span>
          <Button size="sm" onClick={() => bulkApply({ plan_date: today }, `已把 ${sel.size} 家排到今天`)}>排到今天</Button>
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={bulkDate}
              onChange={(e) => setBulkDate(e.target.value)}
              className="w-[136px] px-2 py-1.5 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!bulkDate}
              onClick={() => bulkApply({ plan_date: bulkDate }, `计划日期已改为 ${bulkDate}`)}
            >
              排到该日
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={bulkMarkApplied}
          >
            标记已投
          </Button>
          <button
            onClick={() => setSel(new Set())}
            className="ml-auto rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500"
            title="取消选择"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* 改状态：10 档定死，不给自由文本 */}
      <Modal
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        title={statusTarget ? `${statusTarget.company} · 改状态` : ""}
      >
        {statusTarget ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              选中即保存。进到「待投递」以外任何一档，会自动补上今天为投递日期。
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {JOB_STATUSES.map((n) => (
                <button
                  key={n}
                  onClick={() => pickStatus(statusTarget, n)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
                    stageOf(statusTarget) === n
                      ? "border-terracotta bg-terracotta-50 font-medium text-terracotta-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full bg-current ${TONE_FG[JOB_STATUS_TONE[n]]}`} />
                  {n}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* 日历点开某一天：按状态分组列当天的人 */}
      <Modal open={!!dayDetail} onClose={() => setDayDetail(null)} title={dayDetail ? `${dayDetail} 这一天的投递` : ""}>
        {dayDetail ? (
          <div className="space-y-3">
            {JOB_STATUSES.map((n) => {
              const rows = (byPlanDate[dayDetail] || []).filter((a) => stageOf(a) === n);
              if (!rows.length) return null;
              return (
                <div key={n}>
                  <p className="mb-1 flex items-center gap-1.5 text-xs text-slate-400">
                    <span className={`h-2 w-2 rounded-full bg-current ${TONE_FG[JOB_STATUS_TONE[n]]}`} />
                    {n}（{rows.length}）
                  </p>
                  <div className="space-y-0.5">
                    {rows.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => { setDayDetail(null); openDetail(a); }}
                        className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="min-w-0 truncate">
                          <span className="font-medium text-slate-800">{a.company}</span>
                          <span className="text-xs text-slate-400"> · {a.position || "岗位未填"}</span>
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-400">{a.location || ""}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </Modal>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editingId ? "编辑记录" : "添加公司"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>公司</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="公司名" />
            </div>
            <div>
              <Label>岗位</Label>
              <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="如：AI 产品经理" />
            </div>
            <div>
              <Label>JD 编号（可选）</Label>
              <Input value={form.jd_code} onChange={(e) => setForm({ ...form, jd_code: e.target.value })} placeholder="如 20261028-01" />
            </div>
            <div>
              <Label>工作地点（可选）</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="如：北京市" />
            </div>
            <div>
              <Label>业务方向（可选）</Label>
              <Input value={form.business} onChange={(e) => setForm({ ...form, business: e.target.value })} placeholder="如：B 端 / 搜索 / 大数据" />
            </div>
            <div>
              <Label>岗位发布时间（可选）</Label>
              <Input type="date" value={form.publish_date || ""} onChange={(e) => setForm({ ...form, publish_date: e.target.value })} />
            </div>
            <div>
              <Label>计划投递日期（可选）</Label>
              <Input type="date" value={form.plan_date} onChange={(e) => setForm({ ...form, plan_date: e.target.value })} />
            </div>
            <div>
              <Label>投递日期（投完再填）</Label>
              <Input type="date" value={form.applied_date} onChange={(e) => setForm({ ...form, applied_date: e.target.value })} />
            </div>
            <div>
              <Label>批次（可选）</Label>
              <Input value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} placeholder="如 Day3" />
            </div>
          </div>
          <div>
            <Label>档位（可选）</Label>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setForm({ ...form, tier: "" })}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  form.tier === "" ? "font-medium bg-slate-200 text-slate-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                未分档
              </button>
              {TIERS.map((t) => (
                <button
                  key={t}
                  onClick={() => setForm({ ...form, tier: t })}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    form.tier === t
                      ? "font-medium ring-1 ring-terracotta " + tierStyle(t)
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>投递链接（可选）</Label>
            <Input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://…" />
          </div>
          {resumes.length ? (
            <div>
              <Label>使用简历版本（可选）</Label>
              <select
                value={form.resume_id}
                onChange={(e) => setForm({ ...form, resume_id: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-terracotta"
              >
                <option value="">不关联</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}{r.in_use ? "（在用）" : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <Label>当前状态</Label>
            <div className="flex flex-wrap gap-1.5">
              {statuses.map((s) => (
                <button
                  key={s}
                  onClick={() => setForm({ ...form, status: s })}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    form.status === s
                      ? "font-medium ring-1 ring-terracotta " + styleOf(s)
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>备注（可选）</Label>
            <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="渠道、内推人、薪资范围…" rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
            <Button onClick={save} loading={saving}>保存</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.company} · ${normStatus(detail.status)}` : ""}>
        {detail ? (
          <>
            <div className="mb-4 flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => openEdit(detail)}><Pencil className="h-3.5 w-3.5" /> 编辑</Button>
              {!detail.applied_date ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markApplied(detail)}
                >
                  <CalendarCheck2 className="h-3.5 w-3.5" /> 标记已投
                </Button>
              ) : null}
              <Button variant="danger" size="sm" onClick={() => remove(detail)}><Trash2 className="h-3.5 w-3.5" /> 删除</Button>
            </div>
            {(detail.jd_code || detail.location || detail.business || detail.publish_date || detail.plan_date || detail.applied_date || detail.tier || detail.batch || detail.link || resumeName(detail)) ? (
              <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-slate-50 p-3 text-xs">
                {detail.plan_date ? <p><span className="text-slate-400">计划投递：</span><span className="text-slate-700">{detail.plan_date}</span></p> : null}
                {detail.applied_date ? <p><span className="text-slate-400">已投日期：</span><span className="text-slate-700">{detail.applied_date}</span></p> : null}
                {detail.tier ? <p><span className="text-slate-400">档位：</span><span className="text-slate-700">{detail.tier}</span></p> : null}
                {detail.batch ? <p><span className="text-slate-400">批次：</span><span className="text-slate-700">{detail.batch}</span></p> : null}
                {detail.jd_code ? <p className="min-w-0 break-all"><span className="text-slate-400">JD 编号：</span><span className="text-slate-700">{detail.jd_code}</span></p> : null}
                {detail.publish_date ? (
                  <p>
                    <span className="text-slate-400">岗位发布：</span>
                    <span className="text-slate-700">{detail.publish_date}（已挂 {dayDiff(detail.publish_date, today)} 天）</span>
                  </p>
                ) : null}
                {detail.location ? <p><span className="text-slate-400">地点：</span><span className="text-slate-700">{detail.location}</span></p> : null}
                {detail.business ? <p><span className="text-slate-400">业务：</span><span className="text-slate-700">{detail.business}</span></p> : null}
                {resumeName(detail) ? <p><span className="text-slate-400">简历版本：</span><span className="text-slate-700">{resumeName(detail)}</span></p> : null}
                {detail.link ? (
                  <p className="col-span-2 truncate">
                    <span className="text-slate-400">链接：</span>
                    <a href={detail.link} target="_blank" rel="noreferrer" className="text-terracotta-600 hover:underline">{detail.link}</a>
                  </p>
                ) : null}
              </div>
            ) : null}
            {detail.note ? <p className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{detail.note}</p> : null}

            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <History className="h-4 w-4 text-slate-400" /> 进展时间线
            </h3>
            {events.length === 0 ? (
              <p className="pb-2 text-xs text-slate-400">还没有进展记录</p>
            ) : (
              <div className="mb-4">
                {events.map((item, i) => (
                  <div key={item.id} className="relative flex gap-3 pb-4">
                    {i < events.length - 1 ? <div className="absolute left-[5px] top-4 h-full w-px bg-slate-200" /> : null}
                    <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-terracotta" />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800">{item.title}</p>
                      <p className="text-[11px] text-slate-400">
                        {item.event_date || ""}
                        {item.event_date && item.note ? " · " : ""}
                        {item.note}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2 rounded-lg border border-slate-100 bg-white/60 p-3">
              <Input value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} placeholder="新进展，如：一面通过" />
              <div className="flex gap-2">
                <Input type="date" className="w-40" value={ev.event_date} onChange={(e) => setEv({ ...ev, event_date: e.target.value })} />
                <Input value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} placeholder="补充说明（可选）" />
              </div>
              <Button size="sm" onClick={addEvent} className="w-full">
                <Plus className="h-3.5 w-3.5" /> 记录这条进展
              </Button>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
