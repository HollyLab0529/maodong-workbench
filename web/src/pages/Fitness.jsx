import { useEffect, useMemo, useState } from "react";
import Layout, { PageHeader } from "../components/Layout";
import { listRows, insertRow, deleteRow, todayStr } from "../api";
import { useLiveReload } from "../live";
import { Button, Input, Textarea, Label, Modal, EmptyState, Loading, toast } from "../components/ui";
import { Plus, Trash2, Dumbbell, X, Flame, Timer, Layers } from "lucide-react";

const PARTS = ["胸", "背", "肩", "手臂", "腿", "核心", "有氧"];
const MOVES = ["深蹲", "卧推", "硬拉", "引体", "划船", "推举", "弯举", "平板支撑", "跑步", "跳绳"];

function mondayOf(d) {
  const dt = new Date(d + "T00:00:00");
  const off = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - off);
  return dt.toISOString().slice(0, 10);
}

export default function Fitness() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: todayStr(), parts: [], moves: [], duration: "", note: "" });
  const [custom, setCustom] = useState("");

  const load = async () => {
    try {
      const r = await listRows("workouts");
      setRows(r.sort((a, b) => String(b.date).localeCompare(String(a.date))));
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  const weekStart = mondayOf(todayStr());
  const stats = useMemo(() => {
    const wk = rows.filter((r) => r.date >= weekStart);
    const minutes = wk.reduce((s, r) => s + (Number(r.duration) || 0), 0);
    let sets = 0;
    wk.forEach((r) => {
      try { (JSON.parse(r.exercises || "[]")).forEach((e) => (sets += Number(e.sets) || 0)); } catch {}
    });
    // 近 8 周每周次数
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(weekStart + "T00:00:00");
      d.setDate(d.getDate() - i * 7);
      const s0 = d.toISOString().slice(0, 10);
      const s1 = new Date(d); s1.setDate(s1.getDate() + 6);
      weeks.push({ start: s0, count: rows.filter((r) => r.date >= s0 && r.date <= s1.toISOString().slice(0, 10)).length });
    }
    return { count: wk.length, minutes, sets, weeks, max: Math.max(1, ...weeks.map((w) => w.count)) };
  }, [rows, weekStart]);

  const togglePart = (p) =>
    setForm((f) => ({ ...f, parts: f.parts.includes(p) ? f.parts.filter((x) => x !== p) : [...f.parts, p] }));
  const toggleMove = (mv) =>
    setForm((f) => ({ ...f, moves: f.moves.includes(mv) ? f.moves.filter((x) => x !== mv) : [...f.moves, mv] }));

  const save = async () => {
    if (form.parts.length === 0 && form.moves.length === 0) return toast.error("至少选一个部位或动作");
    setSaving(true);
    try {
      await insertRow("workouts", {
        date: form.date || todayStr(),
        part: form.parts.join("/"),
        exercises: JSON.stringify(form.moves.map((m) => ({ name: m }))),
        duration: Number(form.duration) || 0,
        note: form.note.trim(),
      });
      toast.success("训练已记录 💪");
      setOpen(false);
      setForm({ date: todayStr(), parts: [], moves: [], duration: "", note: "" });
      load();
    } catch (e) {
      toast.error("保存失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r) => {
    if (!window.confirm("删除这条训练记录？")) return;
    try {
      await deleteRow("workouts", r.id);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="健身"
        subtitle="练了就记一笔，看着周数涨起来"
        action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> 记一笔训练</Button>}
      />

      {loading ? (
        <Loading />
      ) : (
        <div className="space-y-5">
          {/* 本周统计 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Flame, label: "本周训练", value: `${stats.count} 次` },
              { icon: Timer, label: "本周时长", value: `${stats.minutes} 分钟` },
              { icon: Layers, label: "本周组数", value: `${stats.sets} 组` },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-xl border border-slate-200/70 bg-white/80 p-4 text-center">
                <Icon className="mx-auto mb-1 h-4 w-4 text-terracotta" />
                <p className="text-lg font-semibold text-slate-900">{value}</p>
                <p className="text-[11px] text-slate-400">{label}</p>
              </div>
            ))}
          </div>

          {/* 近 8 周 */}
          <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4">
            <p className="mb-2 text-xs text-slate-400">近 8 周训练次数</p>
            <div className="flex h-20 items-end gap-2">
              {stats.weeks.map((w) => (
                <div key={w.start} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-md bg-terracotta transition-all"
                    style={{ height: `${Math.max(4, (w.count / stats.max) * 56)}px`, opacity: w.count ? 1 : 0.15 }}
                    title={`${w.start} 那周：${w.count} 次`}
                  />
                  <span className="text-[10px] text-slate-300">{w.start.slice(5).replace("-", "/")}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 记录列表 */}
          {rows.length === 0 ? (
            <EmptyState icon={Dumbbell} text="还没有训练记录，从今天的第一练开始" />
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                let moves = [];
                try { moves = JSON.parse(r.exercises || "[]"); } catch {}
                return (
                  <div key={r.id} className="flex items-start gap-3 rounded-xl border border-slate-200/70 bg-white/80 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-medium text-slate-400">{r.date}</span>
                        {String(r.part || "").split("/").filter(Boolean).map((p) => (
                          <span key={p} className="rounded-full bg-terracotta-50 px-2 py-0.5 text-[11px] text-terracotta-600">{p}</span>
                        ))}
                        {r.duration ? <span className="text-[11px] text-slate-400">{r.duration} 分钟</span> : null}
                      </div>
                      {moves.length ? (
                        <p className="text-sm text-slate-700">{moves.map((m) => m.name).join(" · ")}</p>
                      ) : null}
                      {r.note ? <p className="mt-0.5 text-xs text-slate-400">{r.note}</p> : null}
                    </div>
                    <button onClick={() => remove(r)} className="rounded p-1 text-slate-300 transition-colors hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="记一笔训练">
        <div className="space-y-4">
          <div>
            <Label>日期</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-44" />
          </div>
          <div>
            <Label>练了哪里</Label>
            <div className="flex flex-wrap gap-1.5">
              {PARTS.map((p) => (
                <button key={p} type="button" onClick={() => togglePart(p)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    form.parts.includes(p) ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>做了什么</Label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {MOVES.map((mv) => (
                <button key={mv} type="button" onClick={() => toggleMove(mv)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    form.moves.includes(mv) ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                  {mv}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="别的动作自己加，如：臀桥"
              />
              <Button variant="outline" size="sm" onClick={() => { if (custom.trim()) { toggleMove(custom.trim()); setCustom(""); } }}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div>
            <Label>时长（分钟，可选）</Label>
            <Input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="45" className="w-32" />
          </div>
          <div>
            <Label>感受（可选）</Label>
            <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} placeholder="今天腿部练爆了…" />
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
