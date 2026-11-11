import { useEffect, useMemo, useState } from "react";
import Layout, { PageHeader } from "../components/Layout";
import { listRows, insertRow, updateRow, deleteRow, todayStr } from "../api";
import { useLiveReload } from "../live";
import { Button, Input, Label, Modal, EmptyState, Loading, toast } from "../components/ui";
import {
  Plus, Trash2, Pencil, CreditCard, PauseCircle, PlayCircle, CalendarClock,
  RefreshCw, BellRing, BellOff, AlertTriangle, Check,
} from "lucide-react";

const CYCLES = [
  { id: "once", label: "一次性", perMonth: 0 },
  { id: "week", label: "每周", perMonth: 4.35 },
  { id: "month", label: "每月", perMonth: 1 },
  { id: "season", label: "每季", perMonth: 1 / 3 },
  { id: "year", label: "每年", perMonth: 1 / 12 },
];
const CYCLE_LABEL = Object.fromEntries(CYCLES.map((c) => [c.id, c.label]));
const REMIND_OPTS = [1, 3, 7, 14];

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const n = new Date(todayStr() + "T00:00:00");
  return Math.round((d - n) / 86400000);
}

/** 需要提醒取消的：生效中 + 自动续费开 + 扣费日在提醒窗口内 */
function needsCancel(r) {
  const days = daysUntil(r.next_date);
  if (r.status !== "active") return false;
  if (String(r.auto_renew) === "0") return false;
  if (r.cycle === "once") return false;
  return days !== null && days >= 0 && days <= (Number(r.remind_days) || 3);
}

export default function Subs() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notifyOn, setNotifyOn] = useState(
    () => typeof Notification !== "undefined" && Notification.permission === "granted"
  );
  const [form, setForm] = useState({
    name: "", amount: "", cycle: "month", next_date: "", status: "active",
    note: "", auto_renew: "1", remind_days: 3,
  });

  const load = async () => {
    try {
      const r = await listRows("subs");
      setRows(
        r.sort((a, b) => {
          if (String(a.status) !== String(b.status)) return a.status === "active" ? -1 : 1;
          return String(a.next_date || "9999").localeCompare(String(b.next_date || "9999"));
        })
      );
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  const urgent = useMemo(() => rows.filter(needsCancel), [rows]);

  // 打开页面时，如已授权则发一条系统通知（提醒取消续费）
  useEffect(() => {
    if (loading || !notifyOn || urgent.length === 0) return;
    const key = "wb-subs-notified-" + todayStr();
    try {
      if (localStorage.getItem(key) === String(urgent.length)) return;
      new Notification("猫冬手帐 · 该处理自动续费了", {
        body: urgent.map((r) => `${r.name}（${daysUntil(r.next_date)} 天后扣费）`).join("、"),
        tag: "subs-cancel",
      });
      localStorage.setItem(key, String(urgent.length));
    } catch {
      /* ignore */
    }
  }, [loading, notifyOn, urgent]);

  const askNotify = async () => {
    if (typeof Notification === "undefined") return toast.error("当前浏览器不支持系统通知");
    const p = await Notification.requestPermission();
    if (p === "granted") {
      setNotifyOn(true);
      toast.success("已开启，续费前会提醒你");
    } else {
      toast.error("你拒绝了通知权限，页面内仍会提示");
    }
  };

  const openNew = () => {
    setForm({ name: "", amount: "", cycle: "month", next_date: "", status: "active", note: "", auto_renew: "1", remind_days: 3 });
    setEditingId(null);
    setOpen(true);
  };
  const openEdit = (r) => {
    setForm({
      name: r.name || "", amount: String(r.amount || ""), cycle: r.cycle || "month",
      next_date: r.next_date || "", status: r.status || "active", note: r.note || "",
      auto_renew: String(r.auto_renew ?? "1"), remind_days: Number(r.remind_days) || 3,
    });
    setEditingId(r.id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("填一下订阅名称");
    if (!Number(form.amount)) return toast.error("填一下金额");
    setSaving(true);
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        amount: Number(form.amount),
        note: form.note.trim(),
        auto_renew: form.auto_renew === "0" ? "0" : "1",
        remind_days: Number(form.remind_days) || 3,
      };
      if (editingId) await updateRow("subs", editingId, payload);
      else await insertRow("subs", payload);
      toast.success(editingId ? "已更新" : "已添加订阅");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  /** 标记为「不再续费」：本月继续用，到期自动结束 */
  const stopRenew = async (r) => {
    try {
      await updateRow("subs", r.id, { auto_renew: "0" });
      toast.success(`「${r.name}」已标记不续费，记得去 App 里关掉自动续费`);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const toggleStatus = async (r) => {
    try {
      await updateRow("subs", r.id, { status: r.status === "active" ? "paused" : "active" });
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`删除订阅「${r.name}」？`)) return;
    try {
      await deleteRow("subs", r.id);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const totals = useMemo(() => {
    const act = rows.filter((r) => r.status === "active");
    const recurring = act.filter((r) => r.cycle !== "once");
    const perMonth = recurring.reduce((s, r) => {
      const c = CYCLES.find((x) => x.id === r.cycle) || CYCLES[1];
      return s + Number(r.amount || 0) * c.perMonth;
    }, 0);
    const onceTotal = act.filter((r) => r.cycle === "once").reduce((s, r) => s + Number(r.amount || 0), 0);
    return { count: act.length, perMonth, perYear: perMonth * 12, onceTotal };
  }, [rows]);

  return (
    <Layout>
      <PageHeader
        title="订阅管理"
        subtitle="盯住自动续费，别让会员悄悄续下去"
        action={<Button onClick={openNew}><Plus className="h-4 w-4" /> 添加订阅</Button>}
      />

      {loading ? (
        <Loading />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4 text-center">
              <CreditCard className="mx-auto mb-1 h-4 w-4 text-terracotta" />
              <p className="text-xl font-semibold text-slate-900">{totals.count} 个</p>
              <p className="text-[11px] text-slate-400">生效中订阅</p>
            </div>
            <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4 text-center">
              <p className="text-xl font-semibold text-slate-900">¥{totals.perMonth.toFixed(0)}</p>
              <p className="text-[11px] text-slate-400">折合每月</p>
            </div>
            <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4 text-center">
              <p className="text-xl font-semibold text-terracotta-600">¥{totals.perYear.toFixed(0)}</p>
              <p className="text-[11px] text-slate-400">每年总花费</p>
            </div>
          </div>

          {/* 该取消的续费 */}
          {urgent.length > 0 ? (
            <div className="rounded-xl border border-terracotta-300 bg-terracotta-50 p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-terracotta-700">
                  <AlertTriangle className="h-4 w-4" /> {urgent.length} 个订阅快自动续费了
                </h3>
                {!notifyOn ? (
                  <button onClick={askNotify} className="flex items-center gap-1 text-[11px] text-terracotta-600 hover:underline">
                    <BellRing className="h-3 w-3" /> 开启系统提醒
                  </button>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-terracotta-500">
                    <BellRing className="h-3 w-3" /> 已开启提醒
                  </span>
                )}
              </div>
              <p className="mb-3 text-[11px] leading-relaxed text-terracotta-600">
                只想用这一个月的话，要在扣费前手动取消。在 App 里取消后，回到这里点「已取消续费」，就不会再提醒。
              </p>
              <div className="space-y-2">
                {urgent.map((r) => {
                  const d = daysUntil(r.next_date);
                  return (
                    <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/80 px-3 py-2">
                      <span className="text-sm font-medium text-slate-800">{r.name}</span>
                      <span className="rounded-full bg-terracotta px-2 py-0.5 text-[10px] text-white">
                        {d === 0 ? "今天扣费" : `${d} 天后扣费`}
                      </span>
                      <span className="text-xs text-slate-500">¥{r.amount} / {CYCLE_LABEL[r.cycle] || r.cycle}</span>
                      <span className="flex-1" />
                      <Button size="sm" variant="outline" onClick={() => stopRenew(r)}>
                        <Check className="h-3.5 w-3.5" /> 已取消续费
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {rows.length === 0 ? (
            <EmptyState icon={CreditCard} text="还没有订阅记录，添加第一个吧" />
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const d = daysUntil(r.next_date);
                const active = r.status === "active";
                const soon = active && r.auto_renew !== "0" && r.cycle !== "once" && d !== null && d >= 0 && d <= 7;
                const noRenew = r.auto_renew === "0" || r.cycle === "once";
                return (
                  <div
                    key={r.id}
                    className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
                      soon ? "border-terracotta-200 bg-terracotta-50/60" : "border-slate-200/70 bg-white/80"
                    } ${active ? "" : "opacity-55"}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
                        {r.name}
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-normal text-slate-500">
                          ¥{r.amount} / {CYCLE_LABEL[r.cycle] || r.cycle}
                        </span>
                        {noRenew ? (
                          <span className="flex items-center gap-0.5 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-normal text-green-600">
                            <BellOff className="h-2.5 w-2.5" /> {r.cycle === "once" ? "一次性" : "到期不续费"}
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-normal text-amber-600">
                            <RefreshCw className="h-2.5 w-2.5" /> 自动续费 · 提前 {Number(r.remind_days) || 3} 天提醒
                          </span>
                        )}
                        {soon ? (
                          <span className="rounded-full bg-terracotta px-2 py-0.5 text-[10px] font-normal text-white">
                            {d === 0 ? "今天扣费" : `${d} 天后扣费`}
                          </span>
                        ) : null}
                        {!active ? <span className="text-[10px] font-normal text-slate-400">已暂停</span> : null}
                      </p>
                      {r.note ? <p className="truncate text-xs text-slate-400">{r.note}</p> : null}
                    </div>
                    {r.next_date ? (
                      <span className="shrink-0 text-xs text-slate-400">
                        <CalendarClock className="mr-0.5 inline h-3 w-3" />
                        {r.next_date}
                      </span>
                    ) : null}
                    <button onClick={() => toggleStatus(r)} title={active ? "暂停" : "恢复"} className="rounded p-1 text-slate-300 transition-colors hover:text-terracotta-600">
                      {active ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                    </button>
                    <button onClick={() => openEdit(r)} className="rounded p-1 text-slate-300 transition-colors hover:text-terracotta-600">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove(r)} className="rounded p-1 text-slate-300 transition-colors hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {totals.onceTotal > 0 ? (
            <p className="text-center text-[11px] text-slate-400">另有一次性支出 ¥{totals.onceTotal}（不计入月均）</p>
          ) : null}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? "编辑订阅" : "添加订阅"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>名称</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：iCloud 200G" />
            </div>
            <div>
              <Label>金额（元）</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="21" />
            </div>
          </div>
          <div>
            <Label>扣费周期</Label>
            <div className="flex flex-wrap gap-1">
              {CYCLES.map((c) => (
                <button key={c.id} onClick={() => setForm({ ...form, cycle: c.id })}
                  className={`rounded-full px-2.5 py-1 text-xs ${form.cycle === c.id ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>{form.cycle === "once" ? "购买日期" : "下次扣费日"}</Label>
            <Input type="date" value={form.next_date} onChange={(e) => setForm({ ...form, next_date: e.target.value })} className="w-44" />
          </div>

          {form.cycle !== "once" ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">开启了自动续费</span>
                <button
                  onClick={() => setForm({ ...form, auto_renew: form.auto_renew === "1" ? "0" : "1" })}
                  className={`relative h-5 w-9 rounded-full transition-colors ${form.auto_renew === "1" ? "bg-terracotta" : "bg-slate-300"}`}
                  aria-label="切换自动续费"
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${form.auto_renew === "1" ? "left-[18px]" : "left-0.5"}`} />
                </button>
              </div>
              {form.auto_renew === "1" ? (
                <>
                  <p className="mb-2 text-[11px] text-slate-400">到期前提醒我取消，避免只想用一个月的会员被自动续费。</p>
                  <div className="flex gap-1">
                    {REMIND_OPTS.map((n) => (
                      <button key={n} onClick={() => setForm({ ...form, remind_days: n })}
                        className={`rounded-full px-2.5 py-1 text-xs ${Number(form.remind_days) === n ? "bg-terracotta text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
                        提前 {n} 天
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-slate-400">到期后不再提醒，也不会自动扣费。</p>
              )}
            </div>
          ) : (
            <p className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500">
              一次性订阅不会自动续费，买了就结束，适合「只买这一个月」的情况。
            </p>
          )}

          <div>
            <Label>备注（可选）</Label>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="和同事拼的车位" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} loading={saving}>保存</Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
