import { useEffect, useMemo, useState } from "react";
import Layout, { PageHeader } from "../components/Layout";
import { listRows, insertRow, updateRow, deleteRow, todayStr } from "../api";
import { useLiveReload } from "../live";
import { Button, Input, Label, Modal, EmptyState, Loading, toast } from "../components/ui";
import { Plus, Trash2, Scale, TrendingDown, TrendingUp, Minus } from "lucide-react";

export default function Weight() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: todayStr(), weight: "", body_fat: "", note: "" });

  const load = async () => {
    try {
      const r = await listRows("weights");
      setRows(r.sort((a, b) => String(a.date).localeCompare(String(b.date))));
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  // 同一天只保留一条
  const add = async () => {
    const w = Number(form.weight);
    if (!w || w <= 0 || w > 400) return toast.error("填一个合理的体重（kg）");
    setSaving(true);
    try {
      const payload = {
        date: form.date || todayStr(),
        weight: w,
        body_fat: Number(form.body_fat) || 0,
        note: form.note.trim(),
      };
      const same = rows.find((r) => r.date === payload.date);
      if (same) {
        await updateRow("weights", same.id, payload);
        toast.success("已更新当天记录");
      } else {
        await insertRow("weights", payload);
        toast.success("已记录");
      }
      setOpen(false);
      setForm({ date: todayStr(), weight: "", body_fat: "", note: "" });
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`删除 ${r.date} 的记录？`)) return;
    try {
      await deleteRow("weights", r.id);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const stats = useMemo(() => {
    if (rows.length === 0) return null;
    const latest = rows[rows.length - 1];
    const prev = rows.length > 1 ? rows[rows.length - 2] : null;
    const diff = prev ? latest.weight - prev.weight : 0;
    const recent = rows.slice(-30);
    const min = Math.min(...recent.map((r) => r.weight));
    const max = Math.max(...recent.map((r) => r.weight));
    return { latest, diff, recent, min, max, span: max - min || 1 };
  }, [rows]);

  // 迷你折线
  const path = useMemo(() => {
    if (!stats || stats.recent.length < 2) return "";
    const W = 320, H = 80;
    return stats.recent
      .map((r, i) => {
        const x = (i / (stats.recent.length - 1)) * W;
        const y = H - ((r.weight - stats.min) / stats.span) * (H - 12) - 6;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [stats]);

  const TrendIcon = !stats ? Minus : stats.diff < 0 ? TrendingDown : stats.diff > 0 ? TrendingUp : Minus;

  return (
    <Layout>
      <PageHeader
        title="体重记录"
        subtitle="每天一个数字，趋势比单日更有意义"
        action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> 记一次</Button>}
      />

      {loading ? (
        <Loading />
      ) : !stats ? (
        <EmptyState icon={Scale} text="还没有体重记录，从今天的数字开始" />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4 text-center">
              <p className="text-2xl font-semibold text-slate-900">
                {stats.latest.weight}
                <span className="ml-0.5 text-xs font-normal text-slate-400">kg</span>
              </p>
              <p className="text-[11px] text-slate-400">最新 · {stats.latest.date.slice(5)}</p>
            </div>
            <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4 text-center">
              <p className={`text-2xl font-semibold ${stats.diff < 0 ? "text-green-600" : stats.diff > 0 ? "text-terracotta-600" : "text-slate-900"}`}>
                {stats.diff > 0 ? "+" : ""}{stats.diff.toFixed(1)}
                <span className="ml-0.5 text-xs font-normal text-slate-400">kg</span>
              </p>
              <p className="flex items-center justify-center gap-1 text-[11px] text-slate-400">
                <TrendIcon className="h-3 w-3" /> 较上次
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4 text-center">
              <p className="text-2xl font-semibold text-slate-900">
                {stats.latest.body_fat || "—"}
                <span className="ml-0.5 text-xs font-normal text-slate-400">{stats.latest.body_fat ? "%" : ""}</span>
              </p>
              <p className="text-[11px] text-slate-400">体脂率</p>
            </div>
          </div>

          {stats.recent.length > 1 ? (
            <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4">
              <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                <span>近 {stats.recent.length} 次趋势</span>
                <span>区间 {stats.min.toFixed(1)} ~ {stats.max.toFixed(1)} kg</span>
              </div>
              <svg viewBox="0 0 320 80" className="h-24 w-full" preserveAspectRatio="none">
                <path d={path} fill="none" stroke="rgb(var(--t500))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          ) : null}

          <div className="space-y-2">
            {[...rows].reverse().map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white/80 px-4 py-2.5">
                <span className="w-20 shrink-0 text-xs text-slate-400">{r.date}</span>
                <span className="w-16 shrink-0 text-sm font-medium text-slate-800">{r.weight} kg</span>
                {r.body_fat ? <span className="shrink-0 text-xs text-slate-400">体脂 {r.body_fat}%</span> : null}
                <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{r.note}</span>
                <button onClick={() => remove(r)} className="rounded p-1 text-slate-300 transition-colors hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="记一次体重">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>日期</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <Label>体重（kg）</Label>
              <Input type="number" step="0.1" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} placeholder="52.5" />
            </div>
          </div>
          <div>
            <Label>体脂率（%，可选）</Label>
            <Input type="number" step="0.1" value={form.body_fat} onChange={(e) => setForm({ ...form, body_fat: e.target.value })} placeholder="22.4" className="w-32" />
          </div>
          <div>
            <Label>备注（可选）</Label>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="早上空腹称的" />
          </div>
          <p className="text-[11px] text-slate-400">同一天再记一次会覆盖当天数据。</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={add} loading={saving}>保存</Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
