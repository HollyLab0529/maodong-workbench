import { useEffect, useMemo, useState } from "react";
import Layout, { PageHeader } from "../components/Layout";
import { listRows, insertRow, updateRow, deleteRow } from "../api";
import { useLiveReload } from "../live";
import { Button, Input, Textarea, Label, Modal, EmptyState, Loading, toast } from "../components/ui";
import { Plus, Trash2, Pencil, BookMarked, Star, Download } from "lucide-react";
import { downloadText } from "../download";

const TYPES = ["书", "影", "剧"];
const STATUSES = ["想看", "在看", "看完"];
const STATUS_STYLE = {
  想看: "bg-blue-50 text-blue-600",
  在看: "bg-amber-50 text-amber-600",
  看完: "bg-green-50 text-green-600",
};
const EMPTY = { title: "", creator: "", type: "书", status: "在看", rating: 0, note: "" };

// 筛选选中态用状态色（与徽标一致）
const FILTER_STYLE = {
  想看: "bg-blue-50 text-blue-700",
  在看: "bg-amber-50 text-amber-700",
  看完: "bg-green-50 text-green-700",
};

export default function Reading() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("全部");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const r = await listRows("books");
      setRows(r.reverse());
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  const filtered = useMemo(
    () => (filter === "全部" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter]
  );

  const openNew = () => { setForm(EMPTY); setEditingId(null); setOpen(true); };
  const openEdit = (r) => {
    setForm({ title: r.title || "", creator: r.creator || "", type: r.type || "书", status: r.status || "在看", rating: Number(r.rating) || 0, note: r.note || "" });
    setEditingId(r.id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error("填一下名字");
    setSaving(true);
    try {
      const payload = { ...form, title: form.title.trim(), creator: form.creator.trim(), note: form.note.trim() };
      if (editingId) await updateRow("books", editingId, payload);
      else await insertRow("books", payload);
      toast.success(editingId ? "已更新" : "已加入清单");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const quickStatus = async (r, status) => {
    try {
      await updateRow("books", r.id, { status });
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const rate = async (r, rating) => {
    try {
      await updateRow("books", r.id, { rating });
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`删除「${r.title}」？`)) return;
    try {
      await deleteRow("books", r.id);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  // 导出书单 / 读书笔记（当前筛选结果）
  const exportList = () => {
    if (!filtered.length) return toast.error("当前筛选下没有条目");
    const body = filtered
      .map((r) =>
        [
          `## ${r.title}（${r.type}）`,
          `- 作者 / 导演：${r.creator || "佚名"}`,
          `- 状态：${r.status}　评分：${r.rating ? "★".repeat(Number(r.rating)) : "未评分"}`,
          r.note ? `- 笔记：${r.note}` : "",
          "",
        ]
          .filter(Boolean)
          .join("\n")
      )
      .join("\n");
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`书影音-${filtered.length}条-${stamp}.md`, `# 我的书影音\n\n${body}`);
    toast.success(`已导出 ${filtered.length} 条`);
  };

  return (
    <Layout>
      <PageHeader
        title="书影音"
        subtitle="看过的、想看的，都放书架上"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportList} className="px-2 sm:px-3">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">导出书单</span>
            </Button>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> 加入一本
            </Button>
          </div>
        }
      />

      {loading ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {["全部", ...STATUSES].map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  filter === s
                    ? s === "全部"
                      ? "bg-terracotta font-medium text-white"
                      : `font-medium ${FILTER_STYLE[s] || "bg-slate-100 text-slate-600"}`
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {s}
                {s !== "全部" ? ` ${rows.filter((r) => r.status === s).length}` : ` ${rows.length}`}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={BookMarked} text="书架空着呢，加第一本吧" />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-200/70 bg-white/80 p-4">
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-medium text-slate-900">
                        {r.title}
                        <span className="ml-1.5 text-xs font-normal text-slate-400">{r.type} · {r.creator || "佚名"}</span>
                      </h3>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLE[r.status] || "bg-slate-100 text-slate-500"}`}>
                      {r.status}
                    </span>
                  </div>
                  {/* 星级 */}
                  <div className="mb-2 flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => rate(r, r.rating === n ? 0 : n)} title={`${n} 星`}>
                        <Star className={`h-3.5 w-3.5 ${r.rating >= n ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />
                      </button>
                    ))}
                  </div>
                  {r.note ? <p className="mb-2 line-clamp-2 text-xs text-slate-500">{r.note}</p> : null}
                  <div className="flex items-center gap-1">
                    {STATUSES.filter((s) => s !== r.status).map((s) => (
                      <button
                        key={s}
                        onClick={() => quickStatus(r, s)}
                        className="rounded px-1.5 py-0.5 text-[11px] text-slate-400 transition-colors hover:bg-slate-100 hover:text-terracotta-600"
                      >
                        改为{s}
                      </button>
                    ))}
                    <span className="flex-1" />
                    <button onClick={() => openEdit(r)} className="rounded p-1 text-slate-300 transition-colors hover:text-terracotta-600">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove(r)} className="rounded p-1 text-slate-300 transition-colors hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? "编辑条目" : "加入一本"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>名字</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="如：城南旧事" />
            </div>
            <div>
              <Label>作者 / 导演</Label>
              <Input value={form.creator} onChange={(e) => setForm({ ...form, creator: e.target.value })} placeholder="可选" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>类型</Label>
              <div className="flex gap-1.5">
                {TYPES.map((t) => (
                  <button key={t} onClick={() => setForm({ ...form, type: t })}
                    className={`rounded-full px-3 py-1 text-xs ${form.type === t ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {t}
                  </button>
                ))}
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
          </div>
          <div>
            <Label>短评（可选）</Label>
            <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} placeholder="一句话感受" />
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
