import { useEffect, useMemo, useState } from "react";
import Layout, { PageHeader } from "../components/Layout";
import { listRows, insertRow, updateRow, deleteRow, todayStr } from "../api";
import { useLiveReload } from "../live";
import { Button, Input, Label, Modal, EmptyState, Loading, toast } from "../components/ui";
import { Plus, Trash2, BedDouble, Moon, Clock, Heart } from "lucide-react";

const QUALITY = ["😴", "🙂", "😐", "😵‍💫", "🥴"]; // 1=很好 5=很糟? 反直觉，改为 1 糟 5 好
const Q_LABEL = ["很糟", "较差", "一般", "不错", "超好"];

/** 记录归属日：起床那天。若起床时间 < 18:00 归当天，否则归前一天 */
function ownerDay(wakeup) {
  const [h] = String(wakeup || "08:00").split(":").map(Number);
  const d = new Date(todayStr() + "T00:00:00");
  if (h >= 18) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function durationHours(bed, wake) {
  if (!bed || !wake) return 0;
  const [bh, bm] = bed.split(":").map(Number);
  const [wh, wm] = wake.split(":").map(Number);
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

function mondayOf(d) {
  const dt = new Date(d + "T00:00:00");
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

export default function Sleep() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: todayStr(), bedtime: "23:30", wakeup: "07:30", quality: 3, note: "" });

  const load = async () => {
    try {
      const r = await listRows("sleeps");
      setRows(r.sort((a, b) => String(b.date).localeCompare(String(a.date))));
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  const add = async () => {
    if (!form.bedtime || !form.wakeup) return toast.error("填一下入睡和起床时间");
    setSaving(true);
    try {
      const payload = {
        date: form.date,
        bedtime: form.bedtime,
        wakeup: form.wakeup,
        duration: durationHours(form.bedtime, form.wakeup).toFixed(1),
        quality: form.quality,
        note: form.note.trim(),
      };
      const same = rows.find((r) => r.date === payload.date);
      if (same) {
        await updateRow("sleeps", same.id, payload);
        toast.success("已更新当天记录");
      } else {
        await insertRow("sleeps", payload);
        toast.success("晚安打卡完成 🌙");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`删除 ${r.date} 的睡眠记录？`)) return;
    try {
      await deleteRow("sleeps", r.id);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const stats = useMemo(() => {
    const wk = mondayOf(todayStr());
    const week = rows.filter((r) => r.date >= wk);
    const avg = week.length ? (week.reduce((s, r) => s + Number(r.duration || 0), 0) / week.length).toFixed(1) : "—";
    const avgQ = week.length ? (week.reduce((s, r) => s + Number(r.quality || 3), 0) / week.length).toFixed(1) : "—";
    return { count: week.length, avg, avgQ };
  }, [rows]);

  const fmtDur = (d) => {
    const h = Math.floor(Number(d));
    const m = Math.round((Number(d) - h) * 60);
    return `${h}h${m ? " " + m + "min" : ""}`;
  };

  return (
    <Layout>
      <PageHeader
        title="睡眠打卡"
        subtitle="睡够了才有心情慢慢记"
        action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> 打卡昨晚</Button>}
      />

      {loading ? (
        <Loading />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4 text-center">
              <Clock className="mx-auto mb-1 h-4 w-4 text-terracotta" />
              <p className="text-xl font-semibold text-slate-900">{stats.avg}<span className="ml-0.5 text-xs font-normal text-slate-400">h</span></p>
              <p className="text-[11px] text-slate-400">本周平均时长</p>
            </div>
            <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4 text-center">
              <Heart className="mx-auto mb-1 h-4 w-4 text-terracotta" />
              <p className="text-xl font-semibold text-slate-900">{stats.avgQ}</p>
              <p className="text-[11px] text-slate-400">本周平均质量</p>
            </div>
            <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4 text-center">
              <Moon className="mx-auto mb-1 h-4 w-4 text-terracotta" />
              <p className="text-xl font-semibold text-slate-900">{stats.count} 天</p>
              <p className="text-[11px] text-slate-400">本周已打卡</p>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState icon={BedDouble} text="还没打过卡，记录昨晚吧" />
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white/80 px-4 py-3">
                  <span className="w-20 shrink-0 text-xs text-slate-400">{r.date}</span>
                  <span className="w-28 shrink-0 text-sm text-slate-700">
                    {r.bedtime} → {r.wakeup}
                  </span>
                  <span className="w-20 shrink-0 text-sm font-medium text-slate-900">{fmtDur(r.duration)}</span>
                  <span className="shrink-0 text-sm" title={Q_LABEL[Number(r.quality) - 1]}>
                    {QUALITY[Number(r.quality) - 1] || "😐"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{r.note}</span>
                  <button onClick={() => remove(r)} className="rounded p-1 text-slate-300 transition-colors hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="打卡昨晚">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>归属日期（起床那天）</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <Label>入睡时间</Label>
              <Input type="time" value={form.bedtime} onChange={(e) => setForm({ ...form, bedtime: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>起床时间</Label>
            <Input type="time" value={form.wakeup} onChange={(e) => setForm({ ...form, wakeup: e.target.value })} className="w-36" />
          </div>
          <div>
            <Label>睡得怎么样</Label>
            <div className="flex gap-1.5">
              {QUALITY.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setForm({ ...form, quality: i + 1 })}
                  className={`flex h-11 w-11 flex-col items-center justify-center rounded-lg text-lg transition-colors ${
                    form.quality === i + 1 ? "bg-terracotta-100 ring-2 ring-terracotta" : "bg-slate-50 hover:bg-slate-100"
                  }`}
                  title={Q_LABEL[i]}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>备注（可选）</Label>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="昨晚熬夜追剧了…" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={add} loading={saving}>保存</Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
