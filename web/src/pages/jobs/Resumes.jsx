import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "../../components/Layout";
import { listRows, insertRow, updateRow, deleteRow, uploadImage, fmtTime } from "../../api";
import { useLiveReload } from "../../live";
import { Button, Input, Textarea, Label, Modal, Badge, EmptyState, Loading, toast } from "../../components/ui";
import { Plus, Trash2, FileText, Paperclip, Loader2, CheckCircle2 } from "lucide-react";

const EMPTY = { name: "", target_role: "", file_url: "", content: "", note: "" };

export default function Resumes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = async () => {
    try {
      setRows(await listRows("resumes"));
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b.in_use ? 1 : 0) - (a.in_use ? 1 : 0) || String(b.created_at).localeCompare(String(a.created_at))),
    [rows]
  );

  const openNew = () => { setForm(EMPTY); setEditingId(null); setOpen(true); };
  const openEdit = (r) => {
    setForm({
      name: r.name || "", target_role: r.target_role || "", file_url: r.file_url || "",
      content: r.content || "", note: r.note || "",
    });
    setEditingId(r.id);
    setOpen(true);
  };

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setForm((f) => ({ ...f, file_url: url, name: f.name || file.name.replace(/\.[^.]+$/, "") }));
      toast.success("文件已上传");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("请填写简历名称");
    if (!form.file_url && !form.content.trim()) return toast.error("请上传文件或粘贴文本版内容");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        target_role: form.target_role.trim(),
        file_url: form.file_url,
        content: form.content,
        note: form.note.trim(),
      };
      if (editingId) {
        await updateRow("resumes", editingId, payload);
        toast.success("已更新");
      } else {
        await insertRow("resumes", { ...payload, in_use: rows.length === 0 });
        toast.success("已保存");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error("保存失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  const setInUse = async (r) => {
    try {
      await Promise.all(rows.filter((x) => x.in_use && x.id !== r.id).map((x) => updateRow("resumes", x.id, { in_use: false })));
      await updateRow("resumes", r.id, { in_use: !r.in_use });
      load();
    } catch (e) {
      toast.error("更新失败：" + e.message);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`删除简历「${r.name}」？`)) return;
    try {
      await deleteRow("resumes", r.id);
      load();
    } catch (e) {
      toast.error("删除失败：" + e.message);
    }
  };

  return (
    <>
      <PageHeader
        title="简历库"
        subtitle="存多份针对不同岗位的简历，投递时清楚用的是哪一版"
        action={<Button onClick={openNew}><Plus className="h-4 w-4" /> 添加简历</Button>}
      />

      {loading ? (
        <Loading />
      ) : sorted.length === 0 ? (
        <EmptyState icon={FileText} text="还没有简历版本，上传第一份吧（支持 PDF / Word）" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((r) => (
            <div key={r.id} className={`group rounded-xl border p-4 transition-shadow hover:shadow-soft ${r.in_use ? "border-terracotta-200 bg-terracotta-50/40" : "border-slate-200/70 bg-white/80"}`}>
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-1.5 truncate font-medium text-slate-900">
                    {r.name}
                    {r.in_use ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-terracotta" /> : null}
                  </h3>
                  <p className="text-xs text-slate-400">{r.target_role || "未标注目标岗位"}</p>
                </div>
                <Badge className={r.in_use ? "shrink-0 bg-terracotta text-white" : "shrink-0"}>{r.in_use ? "当前在用" : "备用"}</Badge>
              </div>
              {r.note ? <p className="mb-2 line-clamp-2 text-xs text-slate-500">{r.note}</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                {r.file_url ? (
                  <a
                    href={r.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200"
                  >
                    <Paperclip className="h-3 w-3" /> 打开文件
                  </a>
                ) : null}
                <button
                  onClick={() => setInUse(r)}
                  className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                >
                  {r.in_use ? "取消在用" : "设为在用"}
                </button>
                <span className="ml-auto text-[11px] text-slate-300">{fmtTime(r.created_at)}</span>
                <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => openEdit(r)} className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100">编辑</button>
                  <button onClick={() => remove(r)} className="rounded px-1.5 py-1 text-slate-300 hover:bg-red-50 hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? "编辑简历" : "添加简历"} wide>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>名称</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：AI 产品经理版 v3" />
            </div>
            <div>
              <Label>目标岗位（可选）</Label>
              <Input value={form.target_role} onChange={(e) => setForm({ ...form, target_role: e.target.value })} placeholder="如：AI 应用产品" />
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label>简历文件（PDF / Word，15MB 内）</Label>
              <Button type="button" variant="subtle" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                {uploading ? "上传中…" : form.file_url ? "替换文件" : "上传文件"}
              </Button>
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,application/pdf" className="hidden" onChange={onPickFile} />
            </div>
            {form.file_url ? (
              <a href={form.file_url} target="_blank" rel="noreferrer" className="text-xs text-terracotta-600 underline">
                {form.file_url}
              </a>
            ) : (
              <p className="text-xs text-slate-400">也可以只在下面粘贴文本版内容</p>
            )}
          </div>
          <div>
            <Label>文本版内容（可选，便于搜索与复用）</Label>
            <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={6} placeholder="把简历正文粘进来，之后可以直接搜索关键词" />
          </div>
          <div>
            <Label>备注（可选）</Label>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="这版改了什么、适合投什么岗位" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} loading={saving}>保存</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
