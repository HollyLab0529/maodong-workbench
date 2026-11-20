// 求职看板容器：只管数据和弹窗，四个工作区各自负责自己的排布。
// 以前这里是 1100 行的大文件，筛选口径散在各处，改一个地方就漏一个地方。
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/Layout";
import { listRows, insertRow, updateRow, deleteRow, bulkUpdateRows, todayStr } from "../../api";
import { useLiveReload } from "../../live";
import { Button, Input, Modal, Loading, toast } from "../../components/ui";
import { Plus, History, Pencil, Trash2, CalendarCheck2, X } from "lucide-react";
import { useJobStatuses } from "../../colors";
import {
  STATUS_GROUPS, TIERS, dayDiff, groupByBatch, groupOf, isApplied, isPending, isWaiting, newJobDefaults,
} from "../../jobs";
import TodayView from "./TodayView";
import PackageView from "./PackageView";
import FollowUpView from "./FollowUpView";
import AllView from "./AllView";
import JobForm from "./JobForm";
import ApplyMode from "./ApplyMode";
import BulkImport from "./BulkImport";
import { StatusPill } from "./bits";

const TABS = [
  { key: "today", label: "今天", hint: "今天投哪几家" },
  { key: "package", label: "本包", hint: "这一包投到哪了" },
  { key: "followup", label: "跟进", hint: "谁还没回我" },
  { key: "all", label: "全量", hint: "我总共有哪些" },
];

const TAB_KEY = "wb.jobs.tab";

// 进展里贴的链接自动变成可点，别让人手动复制粘贴
function AutoLink({ text, className = "" }) {
  const parts = String(text || "").split(/(https?:\/\/[^\s）)]+)/g);
  return (
    <p className={`break-words ${className}`}>
      {parts.map((seg, i) =>
        /^https?:\/\//.test(seg) ? (
          <a key={i} href={seg} target="_blank" rel="noreferrer" className="text-terracotta-600 underline hover:text-terracotta-700">
            {seg}
          </a>
        ) : (
          <span key={i}>{seg}</span>
        )
      )}
    </p>
  );
}

export default function Board({ resumeFocus }) {
  const cfg = useJobStatuses();
  const today = todayStr();
  const [apps, setApps] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [policy, setPolicy] = useState({});
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState(() => {
    try {
      return localStorage.getItem(TAB_KEY) || "today";
    } catch {
      return "today";
    }
  });
  const [sel, setSel] = useState(() => new Set());
  const [detailId, setDetailId] = useState(null);
  const [events, setEvents] = useState([]);
  const [ev, setEv] = useState({ title: "", event_date: "", note: "" });
  const [evSaving, setEvSaving] = useState(false);
  const [evEditId, setEvEditId] = useState(null);
  const [evStatus, setEvStatus] = useState("");
  const [statusTargetId, setStatusTargetId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [applyIds, setApplyIds] = useState(null);
  const [bulkDate, setBulkDate] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const detail = apps.find((a) => a.id === detailId) || null;
  const statusTarget = apps.find((a) => a.id === statusTargetId) || null;

  const load = async ({ silent = false } = {}) => {
    try {
      const [rows, rs, settings] = await Promise.all([
        listRows("job_apps"),
        listRows("resumes").catch(() => []),
        listRows("settings").catch(() => []),
      ]);
      setApps(rows);
      setResumes(rs);
      const p = settings.find((s) => s.key === "job_policy");
      if (p?.value) {
        try {
          setPolicy(JSON.parse(p.value));
        } catch {
          setPolicy({});
        }
      }
    } catch (e) {
      if (!silent) toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(() => load({ silent: true }));

  const changeTab = (key) => {
    setTab(key);
    setSel(new Set());
    try {
      localStorage.setItem(TAB_KEY, key);
    } catch {
      /* 无痕模式忽略 */
    }
  };

  // ===== 写入：先改本地再等服务器回真值，失败回滚 =====
  const patchRow = async (id, patch) => {
    const prev = apps.find((a) => a.id === id);
    setApps((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    try {
      const saved = await updateRow("job_apps", id, patch);
      setApps((list) => list.map((a) => (a.id === id ? saved : a)));
      return saved;
    } catch (e) {
      if (prev) setApps((list) => list.map((a) => (a.id === id ? prev : a)));
      toast.error("更新失败：" + e.message);
      throw e;
    }
  };

  const patchMany = async (ids, patch, tip) => {
    if (!ids.length) return;
    const prevById = new Map(apps.filter((a) => ids.includes(a.id)).map((a) => [a.id, a]));
    // 乐观更新 + 就地盖返回值，不再整页重拉（一次拉全量太重，还会闪一下）
    setApps((list) => list.map((a) => (ids.includes(a.id) ? { ...a, ...patch, updated_at: new Date().toISOString() } : a)));
    try {
      const r = await bulkUpdateRows("job_apps", ids, patch);
      toast.success(tip || `已更新 ${r.changed} 家`);
      if (r.failed?.length) {
        const names = r.failed.map((id) => prevById.get(id)?.company || `#${id}`).join("、");
        toast.error(`这些没改成功：${names}`);
        await load({ silent: true }); // 部分成功时拉一次，别让本地和服务器不一致
      }
    } catch (e) {
      // 请求本身失败：可能部分成功，回滚到服务器真相
      toast.error("批量更新失败，可能部分成功，已刷新看看：" + e.message);
      await load({ silent: true });
    }
  };

  const markApplied = async (ids) => {
    if (!ids.length) return;
    const pendingIds = ids.filter((id) => {
      const a = apps.find((x) => x.id === id);
      return a && groupOf(a.status, cfg.config) === "todo";
    });
    const restIds = ids.filter((id) => !pendingIds.includes(id));
    const firstApplied = (cfg.byGroup("applied")[0] || {}).name || cfg.statuses[1] || cfg.statuses[0];
    try {
      if (pendingIds.length) await patchMany(pendingIds, { applied_date: today, status: firstApplied }, `${pendingIds.length} 家已标记投出`);
      if (restIds.length) await patchMany(restIds, { applied_date: today }, `已补上投递日期：${restIds.length} 家`);
      if (ids.length === 1) toast.success("已标记为已投");
    } catch {
      /* patchMany 里已经报错 */
    }
  };

  const removeRow = async (id) => {
    const a = apps.find((x) => x.id === id);
    if (!a) return;
    if (!window.confirm(`确定删除「${a.company}」的记录？`)) return;
    try {
      await deleteRow("job_apps", id);
      setApps((list) => list.filter((x) => x.id !== id));
      if (detailId === id) setDetailId(null);
      setSel((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success("已删除");
    } catch (e) {
      toast.error("删除失败：" + e.message);
    }
  };

  // ===== 弹窗 =====
  // 时间线按事件日期排（没填日期回落到写入时间），新的在上
  const sortEvents = (list) =>
    [...list].sort((a, b) => {
      const ka = a.event_date || String(a.created_at || "").slice(0, 10);
      const kb = b.event_date || String(b.created_at || "").slice(0, 10);
      return String(kb).localeCompare(String(ka)) || String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });

  const openDetail = async (a) => {
    setDetailId(a.id);
    setEv({ title: "", event_date: today, note: "" });
    setEvEditId(null);
    setEvStatus("");
    try {
      const all = await listRows("job_events");
      setEvents(sortEvents(all.filter((e) => Number(e.app_id) === a.id)));
    } catch {
      setEvents([]);
    }
  };

  const addEvent = async () => {
    if (evSaving || !detail) return;
    if (!ev.title.trim()) return toast.error("请填写进展内容");
    setEvSaving(true);
    try {
      const payload = { app_id: detail.id, title: ev.title.trim(), event_date: ev.event_date || today, note: ev.note.trim() };
      // 改一条：更新后按日期重排；新增：插进去再排
      const row = evEditId
        ? await updateRow("job_events", evEditId, payload)
        : await insertRow("job_events", payload);
      setEvents((list) => sortEvents(evEditId ? list.map((x) => (x.id === row.id ? row : x)) : [row, ...list]));
      setEv({ title: "", event_date: today, note: "" });
      setEvEditId(null);
      toast.success(evEditId ? "已更新这条进展" : "已记录进展");
      // 勾了推进状态就顺手改看板，不勾不动
      if (evStatus) {
        const target = evStatus;
        setEvStatus("");
        await patchRow(detail.id, { status: target });
        toast.success(`看板状态已推进到「${target}」`);
      }
    } catch (e) {
      toast.error("保存失败：" + e.message);
    } finally {
      setEvSaving(false);
    }
  };

  const editEvent = (item) => {
    setEvEditId(item.id);
    setEv({ title: item.title || "", event_date: item.event_date || today, note: item.note || "" });
  };

  const removeEvent = async (item) => {
    if (!window.confirm("删除这条进展？")) return;
    try {
      await deleteRow("job_events", item.id);
      setEvents((list) => list.filter((x) => x.id !== item.id));
      if (evEditId === item.id) { setEvEditId(null); setEv({ title: "", event_date: today, note: "" }); }
      toast.success("已删除");
    } catch (e) {
      toast.error("删除失败：" + e.message);
    }
  };

  const openNew = (opts = {}) => {
    const inUse = resumes.find((r) => r.in_use);
    const base = newJobDefaults({
      today,
      batch: opts.batch,
      batchDate: opts.batch && /20\d{2}-\d{2}-\d{2}/.test(opts.batch) ? String(opts.batch).match(/20\d{2}-\d{2}-\d{2}/)[0] : undefined,
      resumeId: inUse?.id,
      statuses: cfg.statuses,
    });
    setFormInitial(base);
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (a) => {
    setFormInitial({
      company: a.company || "", position: a.position || "", jd_code: a.jd_code || "",
      location: a.location || "", business: a.business || "", link: a.link || "",
      applied_date: a.applied_date || "", plan_date: a.plan_date || "", publish_date: a.publish_date || "",
      tier: a.tier || "", batch: a.batch || "", batch_date: a.batch_date || "",
      resume_id: a.resume_id ? String(a.resume_id) : "",
      status: a.status || cfg.statuses[0], note: a.note || "",
      city: a.city || "", city_multi: a.city_multi === "1", company_type: a.company_type || "",
      source: a.source || "", next_action: a.next_action || "", next_action_date: a.next_action_date || "",
    });
    setEditingId(a.id);
    setFormOpen(true);
  };

  const saveForm = async (payload, id) => {
    if (id) {
      const saved = await updateRow("job_apps", id, payload);
      setApps((list) => list.map((a) => (a.id === id ? saved : a)));
      toast.success("已更新");
    } else {
      const saved = await insertRow("job_apps", payload);
      setApps((list) => [saved, ...list]);
      toast.success("已添加");
    }
  };

  const pickStatus = async (a, status) => {
    setStatusTargetId(null);
    try {
      await patchRow(a.id, { status });
      toast.success(`已改为「${status}」`);
    } catch {
      /* patchRow 已提示 */
    }
  };

  // 首页直达：/jobs?id=xx 打开对应岗位
  const [sp, setSp] = useSearchParams();
  useEffect(() => {
    const id = sp.get("id");
    if (!id || loading) return;
    const a = apps.find((x) => String(x.id) === id);
    if (a) openDetail(a);
    setSp({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, apps]);

  const stats = useMemo(() => {
    const pending = apps.filter((a) => isPending(a, cfg.statuses));
    return {
      applied: apps.filter((a) => isApplied(a, cfg.statuses)).length,
      pending: pending.length,
      overdue: pending.filter((a) => a.plan_date && a.plan_date < today).length,
      today: pending.filter((a) => a.plan_date === today).length,
      waiting: apps.filter((a) => isWaiting(a, cfg.statuses)).length,
      total: apps.length,
    };
  }, [apps, cfg.statuses, today]);

  const toggleSel = (id) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const applyQueue = (applyIds || []).map((id) => apps.find((a) => a.id === id)).filter(Boolean);
  const batches = useMemo(() => Array.from(new Set(apps.map((a) => a.batch).filter(Boolean))).sort((x, y) => y.localeCompare(x)), [apps]);

  // 简历库点了「被 N 个岗位引用」→ 切到全量视图，并把简历版本作为筛选条件传下去
  useEffect(() => {
    if (resumeFocus?.id) changeTab("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeFocus]);

  const viewProps = {
    apps, cfg, today, sel, toggleSel, setSel,
    patchRow, patchMany, markApplied, openDetail, openForm: openNew,
    onStatusOpen: (a) => setStatusTargetId(a.id),
  };

  return (
    <>
      <PageHeader
        title="求职看板"
        subtitle={`在池 ${stats.total} 家 · 已投 ${stats.applied} 家 · 待投 ${stats.pending} 家${stats.overdue ? ` · 逾期 ${stats.overdue} 家` : ""}`}
        action={<Button onClick={() => openNew()}><Plus className="h-4 w-4" /> 加岗位</Button>}
      />

      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => changeTab(t.key)}
            className={`shrink-0 rounded-xl border px-3.5 py-2 text-left transition-colors ${
              tab === t.key ? "border-terracotta bg-terracotta text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className="block text-sm font-medium">{t.label}</span>
            <span className={`block text-[11px] ${tab === t.key ? "text-white/70" : "text-slate-400"}`}>{t.hint}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : tab === "today" ? (
        <TodayView {...viewProps} startApply={(list) => setApplyIds(list.map((a) => a.id))} />
      ) : tab === "package" ? (
        <PackageView {...viewProps} policy={policy} startApply={(list) => setApplyIds(list.map((a) => a.id))} />
      ) : tab === "followup" ? (
        <FollowUpView {...viewProps} />
      ) : (
        <AllView {...viewProps} resumes={resumes} focusResume={resumeFocus} openImport={() => setImportOpen(true)} />
      )}

      {/* 批量浮条：四个工作区共用 */}
      {sel.size ? (
        <div className="fixed bottom-4 left-1/2 z-40 flex w-[min(94vw,620px)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-xl pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <span className="text-xs font-medium text-slate-700">已选 {sel.size} 家</span>
          <Button size="sm" onClick={() => markApplied([...sel])}>标记已投</Button>
          <Button size="sm" variant="outline" onClick={() => patchMany([...sel], { plan_date: today }, `已排到今天：${sel.size} 家`)}>
            排到今天
          </Button>
          <div className="flex items-center gap-1">
            <Input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} className="w-[132px] px-2 py-1.5 text-xs" />
            <Button
              size="sm"
              variant="outline"
              disabled={!bulkDate}
              onClick={() => patchMany([...sel], { plan_date: bulkDate }, `计划日期已改成 ${bulkDate}`)}
            >
              排到该日
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => patchMany([...sel], { batch: "" }, `已移出本包：${sel.size} 家`)}>
            移出本包
          </Button>
          <select
            value=""
            onChange={(e) => { if (e.target.value) patchMany([...sel], { tier: e.target.value }, `档位已改为「${e.target.value}」`); }}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none focus:border-terracotta"
          >
            <option value="">改档位…</option>
            {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
            <option value="">不分档</option>
          </select>
          <select
            value=""
            onChange={(e) => { if (e.target.value) patchMany([...sel], { city: e.target.value }, `城市已改为「${e.target.value}」`); }}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none focus:border-terracotta"
          >
            <option value="">改城市…</option>
            {["北京", "天津", "上海", "其他"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => setSel(new Set())} className="ml-auto rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500" title="取消选择">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <JobForm
        open={formOpen}
        initial={formInitial}
        editingId={editingId}
        cfg={cfg}
        resumes={resumes}
        today={today}
        batches={batches}
        policy={policy}
        onClose={() => { setFormOpen(false); setEditingId(null); }}
        onSave={saveForm}
        onDelete={(id) => { removeRow(id); setFormOpen(false); }}
      />

      {applyQueue.length ? (
        <ApplyMode
          queue={applyQueue}
          today={today}
          resumes={resumes}
          onApplied={(a) => markApplied([a.id])}
          onSkip={() => {}}
          onClose={() => setApplyIds(null)}
        />
      ) : null}

      {/* 批量导入：成功后用返回值就地插入，不整页重拉 */}
      <BulkImport
        open={importOpen}
        existing={apps}
        cfg={cfg}
        today={today}
        onClose={() => setImportOpen(false)}
        onDone={(saved) => {
          const rows = (saved || []).filter((r) => r && r.id && !r.__single);
          if (rows.length) setApps((list) => [...rows.reverse(), ...list]);
        }}
      />

      {/* 改状态：按语义组分区，选中即存 */}
      <Modal open={!!statusTarget} onClose={() => setStatusTargetId(null)} title={statusTarget ? `${statusTarget.company} · 改状态` : ""}>
        {statusTarget ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              现在：<StatusPill status={statusTarget.status} styleOf={cfg.styleOf} size="sm" />
              <span className="ml-2">点一下就存，不再自动改投递日期。</span>
            </p>
            {STATUS_GROUPS.map((g) => {
              const list = cfg.config.filter((c) => c.group === g.key);
              if (!list.length) return null;
              return (
                <div key={g.key}>
                  <p className="mb-1 text-[11px] text-slate-300">{g.label}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {list.map((c) => (
                      <button
                        key={c.name}
                        onClick={() => pickStatus(statusTarget, c.name)}
                        className={`rounded-lg border px-2.5 py-2 text-left text-xs ${
                          statusTarget.status === c.name
                            ? "border-terracotta bg-terracotta-50 font-medium text-terracotta-700"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </Modal>

      {/* 详情：时间线 + 下一步 */}
      <Modal open={!!detail} onClose={() => setDetailId(null)} title={detail ? `${detail.company} · ${detail.position || "岗位未填"}` : ""} wide>
        {detail ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-1">
              <StatusPill status={detail.status} styleOf={cfg.styleOf} size="sm" onOpen={() => setStatusTargetId(detail.id)} />
              <Button variant="ghost" size="sm" onClick={() => { setDetailId(null); openEdit(detail); }}>
                <Pencil className="h-3.5 w-3.5" /> 编辑
              </Button>
              {isPending(detail, cfg.statuses) ? (
                <Button variant="ghost" size="sm" onClick={() => markApplied([detail.id])}>
                  <CalendarCheck2 className="h-3.5 w-3.5" /> 标记已投
                </Button>
              ) : null}
              <Button variant="danger" size="sm" onClick={() => removeRow(detail.id)} className="ml-auto">
                <Trash2 className="h-3.5 w-3.5" /> 删除
              </Button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-slate-50 p-3 text-xs">
              {detail.plan_date ? <p><span className="text-slate-400">计划投递：</span>{detail.plan_date}</p> : null}
              {detail.applied_date ? (
                <p>
                  <span className="text-slate-400">已投：</span>
                  {detail.applied_date}
                  <span className="ml-1 text-slate-400">（{dayDiff(detail.applied_date, today)} 天）</span>
                </p>
              ) : null}
              {detail.status_changed_at ? (
                <p><span className="text-slate-400">状态停在：</span>{dayDiff(String(detail.status_changed_at).slice(0, 10), today)} 天前</p>
              ) : null}
              {detail.next_action ? (
                <p className="col-span-2">
                  <span className="text-slate-400">下一步：</span>{detail.next_action}
                  {detail.next_action_date ? <span className="ml-1 text-slate-400">（{detail.next_action_date}）</span> : null}
                </p>
              ) : null}
              {detail.city || detail.location ? <p><span className="text-slate-400">城市：</span>{detail.city || detail.location}</p> : null}
              {detail.company_type ? <p><span className="text-slate-400">公司类型：</span>{detail.company_type}</p> : null}
              {detail.source ? <p><span className="text-slate-400">来源：</span>{detail.source}</p> : null}
              {detail.tier ? <p><span className="text-slate-400">档位：</span>{detail.tier}</p> : null}
              {detail.batch ? <p><span className="text-slate-400">批次：</span>{detail.batch}</p> : null}
              {detail.publish_date ? (
                <p><span className="text-slate-400">发布：</span>{detail.publish_date}（{dayDiff(detail.publish_date, today)} 天）</p>
              ) : null}
              {resumes.find((r) => r.id === Number(detail.resume_id)) ? (
                <p><span className="text-slate-400">简历：</span>{resumes.find((r) => r.id === Number(detail.resume_id)).name}</p>
              ) : null}
              {detail.jd_code ? <p><span className="text-slate-400">JD：</span>{detail.jd_code}</p> : null}
              {detail.link ? (
                <p className="col-span-2 truncate">
                  <span className="text-slate-400">链接：</span>
                  <a href={detail.link} target="_blank" rel="noreferrer" className="text-terracotta-600 hover:underline">{detail.link}</a>
                </p>
              ) : (
                <p className="col-span-2 text-amber-600">没有存投递链接，下次投之前记得补上。</p>
              )}
            </div>
            {detail.note ? <p className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{detail.note}</p> : null}

            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <History className="h-4 w-4 text-slate-400" /> 进展
            </h3>
            {events.length ? (
              <div className="mb-3">
                {events.map((item, i) => (
                  <div key={item.id} className={`relative flex gap-3 pb-3 ${evEditId === item.id ? "rounded-lg bg-terracotta-50/50 px-1" : ""}`}>
                    {i < events.length - 1 ? <div className="absolute left-[5px] top-4 h-full w-px bg-slate-200" /> : null}
                    <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-terracotta" />
                    <div className="min-w-0 flex-1">
                      <AutoLink text={item.title} className="text-sm text-slate-800" />
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-slate-400">{item.event_date || "日期未填"}</p>
                          {item.note ? <AutoLink text={item.note} className="text-[11px] text-slate-400" /> : null}
                        </div>
                        <div className="flex shrink-0 gap-0.5">
                          <button onClick={() => editEvent(item)} title="编辑" className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button onClick={() => removeEvent(item)} title="删除" className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-400">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-3 text-xs text-slate-400">还没有进展记录</p>
            )}
            <div className="space-y-2 rounded-lg border border-slate-100 p-3">
              {evEditId ? <p className="text-[11px] text-terracotta-600">正在改已有的一条，保存后按日期重新排序</p> : null}
              <Input value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} placeholder="新进展，如：一面通过（贴链接会自动变成可点）" />
              <div className="flex gap-2">
                <Input type="date" className="w-40" value={ev.event_date} onChange={(e) => setEv({ ...ev, event_date: e.target.value })} />
                <Input value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} placeholder="补充说明（可选）" />
              </div>
              {!evEditId ? (
                <select
                  value={evStatus}
                  onChange={(e) => setEvStatus(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 outline-none focus:border-terracotta"
                >
                  <option value="">不同步看板状态</option>
                  {cfg.statuses.filter((s) => s !== detail.status).map((s) => (
                    <option key={s} value={s}>同时把状态推进到：{s}</option>
                  ))}
                </select>
              ) : null}
              <div className="flex gap-2">
                {evEditId ? (
                  <Button size="sm" variant="outline" onClick={() => { setEvEditId(null); setEv({ title: "", event_date: today, note: "" }); }} className="flex-1">
                    取消修改
                  </Button>
                ) : null}
                <Button size="sm" onClick={addEvent} loading={evSaving} className="flex-1">
                  <Plus className="h-3.5 w-3.5" /> {evEditId ? "保存修改" : "记一条"}
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
