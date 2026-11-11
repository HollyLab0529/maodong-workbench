import { useEffect, useMemo, useState } from "react";
import Layout, { PageHeader } from "../components/Layout";
import { listRows, insertRow, deleteRow, todayStr } from "../api";
import { useLiveReload } from "../live";
import { Button, Input, Label, Modal, EmptyState, Loading, toast } from "../components/ui";
import { Plus, Trash2, Sparkles } from "lucide-react";

const WEEK = ["一", "二", "三", "四", "五", "六", "日"];

/** 本周 7 天（周一起）的日期串 */
function weekDays() {
  const d = new Date(todayStr() + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(x.getDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

export default function Habits() {
  const [habits, setHabits] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState(3);

  const days = useMemo(() => weekDays(), []);
  const today = todayStr();

  const load = async () => {
    try {
      const [h, l] = await Promise.all([listRows("habits"), listRows("habit_logs")]);
      setHabits(h);
      setLogs(l);
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  const doneSet = useMemo(() => {
    const s = new Set();
    logs.forEach((l) => s.add(`${l.habit_id}|${String(l.date).slice(0, 10)}`));
    return s;
  }, [logs]);

  const isDone = (h, d) => doneSet.has(`${h.id}|${d}`);

  const toggle = async (h, d) => {
    const hit = logs.find((l) => Number(l.habit_id) === h.id && String(l.date).slice(0, 10) === d);
    try {
      if (hit) await deleteRow("habit_logs", hit.id);
      else await insertRow("habit_logs", { habit_id: h.id, date: d });
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const add = async () => {
    if (!title.trim()) return toast.error("给习惯起个名字");
    try {
      await insertRow("habits", { title: title.trim(), target_per_week: Number(target) || 1 });
      toast.success("习惯已创建，点格子打卡");
      setOpen(false);
      setTitle("");
      setTarget(3);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async (h) => {
    if (!window.confirm(`删除习惯「${h.title}」？历史打卡会一并消失`)) return;
    try {
      const mine = logs.filter((l) => Number(l.habit_id) === h.id);
      await deleteRow("habits", h.id);
      for (const l of mine) {
        try { await deleteRow("habit_logs", l.id); } catch {}
      }
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="习惯打卡"
        subtitle="一周 7 格，点一点就完成"
        action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> 新习惯</Button>}
      />

      {loading ? (
        <Loading />
      ) : habits.length === 0 ? (
        <EmptyState icon={Sparkles} text="还没有习惯，创建第一个吧" />
      ) : (
        <div className="space-y-2">
          {habits.map((h) => {
            const weekDone = days.filter((d) => isDone(h, d)).length;
            const target = Number(h.target_per_week) || 7;
            const ok = weekDone >= target;
            return (
              <div key={h.id} className="rounded-xl border border-slate-200/70 bg-white/80 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {h.title}
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${ok ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-400"}`}>
                        本周 {weekDone}/{target}
                      </span>
                    </p>
                  </div>
                  <button onClick={() => remove(h)} className="rounded p-1 text-slate-300 transition-colors hover:text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {days.map((d, i) => {
                    const done = isDone(h, d);
                    const isToday = d === today;
                    return (
                      <button
                        key={d}
                        onClick={() => toggle(h, d)}
                        className={`flex flex-col items-center gap-1 rounded-lg border py-2 transition-colors ${
                          done
                            ? "border-terracotta bg-terracotta text-white"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        } ${isToday && !done ? "border-terracotta-300" : ""}`}
                      >
                        <span className={`text-[10px] ${done ? "text-white/80" : "text-slate-400"}`}>
                          {WEEK[i]}
                        </span>
                        <span className="text-sm">{done ? "✓" : ""}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="新习惯">
        <div className="space-y-4">
          <div>
            <Label>习惯名称</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：每天喝够 2L 水" />
          </div>
          <div>
            <Label>每周目标</Label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  onClick={() => setTarget(n)}
                  className={`h-8 w-8 rounded-lg text-xs transition-colors ${
                    Number(target) === n ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={add}>创建</Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
