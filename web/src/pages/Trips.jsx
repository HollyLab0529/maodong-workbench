import { useEffect, useMemo, useState } from "react";
import Layout, { PageHeader } from "../components/Layout";
import { listRows, insertRow, updateRow, deleteRow, todayStr } from "../api";
import { useLiveReload } from "../live";
import { Button, Input, Textarea, Label, Modal, EmptyState, Loading, toast } from "../components/ui";
import { Plus, Trash2, Pencil, Plane, MapPin, CalendarRange } from "lucide-react";

const STATUSES = ["计划中", "进行中", "已完成"];
const STATUS_STYLE = {
  计划中: "bg-blue-50 text-blue-600",
  进行中: "bg-amber-50 text-amber-600",
  已完成: "bg-green-50 text-green-600",
};
const EMPTY = { title: "", place: "", start_date: "", end_date: "", budget: "", status: "计划中", note: "", items_text: "" };

export default function Trips() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [newItem, setNewItem] = useState("");

  const load = async () => {
    try {
      const r = await listRows("trips");
      setRows(r.reverse());
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  const itemsOf = (trip) => {
    try {
      const arr = JSON.parse(trip.items || "[]");
      return Array.isArray(arr) ? arr.filter((x) => x && x.text) : [];
    } catch {
      return [];
    }
  };

  const openNew = () => { setForm(EMPTY); setEditingId(null); setOpen(true); };
  const openEdit = (r) => {
    setForm({
      title: r.title || "", place: r.place || "", start_date: r.start_date || "", end_date: r.end_date || "",
      budget: String(r.budget || ""), status: r.status || "计划中", note: r.note || "", items_text: "",
    });
    setEditingId(r.id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error("给行程起个名字");
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        place: form.place.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
        budget: Number(form.budget) || 0,
        status: form.status,
        note: form.note.trim(),
      };
      if (editingId) await updateRow("trips", editingId, payload);
      else await insertRow("trips", payload);
      toast.success(editingId ? "已更新" : "行程已创建");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`删除行程「${r.title}」？`)) return;
    try {
      await deleteRow("trips", r.id);
      if (detail?.id === r.id) setDetail(null);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const openDetail = (r) => {
    setDetail(r);
    setNewItem("");
  };

  const addItem = async () => {
    if (!newItem.trim() || !detail) return;
    const items = [...itemsOf(detail), { text: newItem.trim(), done: false }];
    try {
      await updateRow("trips", detail.id, { items: JSON.stringify(items) });
      setDetail({ ...detail, items: JSON.stringify(items) });
      setNewItem("");
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const toggleItem = async (idx) => {
    const items = itemsOf(detail);
    items[idx] = { ...items[idx], done: !items[idx].done };
    try {
      await updateRow("trips", detail.id, { items: JSON.stringify(items) });
      setDetail({ ...detail, items: JSON.stringify(items) });
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const removeItem = async (idx) => {
    const items = itemsOf(detail).filter((_, i) => i !== idx);
    try {
      await updateRow("trips", detail.id, { items: JSON.stringify(items) });
      setDetail({ ...detail, items: JSON.stringify(items) });
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const daysLabel = (r) => {
    if (!r.start_date) return "";
    const s = new Date(r.start_date + "T00:00:00");
    const e = new Date((r.end_date || r.start_date) + "T00:00:00");
    const n = Math.round((e - s) / 86400000) + 1;
    return `${r.start_date.slice(5)} 出发 · ${n} 天`;
  };

  const upcoming = useMemo(() => {
    const t = todayStr();
    return rows
      .filter((r) => r.start_date && r.start_date >= t && r.status !== "已完成")
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  }, [rows]);

  return (
    <Layout>
      <PageHeader
        title="旅行清单"
        subtitle="想去的地方和要做的事，先记下来"
        action={<Button onClick={openNew}><Plus className="h-4 w-4" /> 新行程</Button>}
      />

      {loading ? (
        <Loading />
      ) : (
        <div className="space-y-5">
          {upcoming.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {upcoming.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openDetail(r)}
                  className="flex items-center gap-1.5 rounded-full border border-terracotta-200 bg-terracotta-50 px-3 py-1 text-xs text-terracotta-700 hover:bg-terracotta-100"
                >
                  <Plane className="h-3.5 w-3.5" />
                  {r.title}
                  <span className="text-terracotta-500">
                    {Math.round((new Date(r.start_date) - new Date(todayStr())) / 86400000) === 0
                      ? "今天出发"
                      : `${Math.round((new Date(r.start_date) - new Date(todayStr())) / 86400000)} 天后`}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {rows.length === 0 ? (
            <EmptyState icon={Plane} text="还没有行程，计划第一次出发吧" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((r) => {
                const items = itemsOf(r);
                const done = items.filter((x) => x.done).length;
                return (
                  <div
                    key={r.id}
                    className="cursor-pointer rounded-xl border border-slate-200/70 bg-white/80 p-4 transition-shadow hover:shadow-soft"
                    onClick={() => openDetail(r)}
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-medium text-slate-900">{r.title}</h3>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                          {r.place ? <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{r.place}</span> : null}
                          {r.start_date ? <span className="flex items-center gap-0.5"><CalendarRange className="h-3 w-3" />{daysLabel(r)}</span> : null}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLE[r.status] || "bg-slate-100 text-slate-500"}`}>
                        {r.status}
                      </span>
                    </div>
                    {r.budget ? <p className="text-xs text-slate-500">预算 ¥{r.budget}</p> : null}
                    {items.length ? (
                      <div className="mt-2">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-terracotta transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">行前清单 {done}/{items.length}</p>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 行程详情 + 行前清单 */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.title}` : ""}>
        {detail ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs ${STATUS_STYLE[detail.status] || ""}`}>{detail.status}</span>
              <Button variant="ghost" size="sm" onClick={() => { openEdit(detail); setDetail(null); }}><Pencil className="h-3.5 w-3.5" /> 编辑</Button>
              <Button variant="danger" size="sm" onClick={() => remove(detail)}><Trash2 className="h-3.5 w-3.5" /> 删除</Button>
            </div>
            {detail.note ? <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{detail.note}</p> : null}

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">行前清单</h3>
              {itemsOf(detail).length === 0 ? (
                <p className="text-xs text-slate-400">还没加清单项</p>
              ) : (
                <div className="space-y-1.5">
                  {itemsOf(detail).map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={!!it.done}
                        onChange={() => toggleItem(idx)}
                        className="h-4 w-4 accent-[rgb(var(--t500))]"
                      />
                      <span className={`flex-1 text-sm ${it.done ? "text-slate-300 line-through" : "text-slate-800"}`}>{it.text}</span>
                      <button onClick={() => removeItem(idx)} className="rounded p-0.5 text-slate-300 transition-colors hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <Input
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addItem()}
                  placeholder="加一项，如：充电宝 / 防晒霜"
                />
                <Button variant="outline" size="sm" onClick={addItem}><Plus className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? "编辑行程" : "新行程"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>行程名称</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="如：大理 4 日" />
            </div>
            <div>
              <Label>目的地</Label>
              <Input value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} placeholder="如：云南·大理" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>出发</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <Label>返程</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
            <div>
              <Label>预算（元）</Label>
              <Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="3000" />
            </div>
          </div>
          <div>
            <Label>状态</Label>
            <div className="flex gap-1.5">
              {STATUSES.map((s) => (
                <button key={s} onClick={() => setForm({ ...form, status: s })}
                  className={`rounded-full px-3 py-1 text-xs ${form.status === s ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>备注（可选）</Label>
            <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} placeholder="同行的人、想做的事…" />
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
