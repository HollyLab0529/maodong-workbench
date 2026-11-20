// 简历库：版本清单 + 引用关系。回答「这份简历现在被哪些岗位在用」。
// 40 份简历平铺会找不到东西，所以按方向分组、按天归档收进折叠区、顶部能搜。
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "../../components/Layout";
import { listRows, insertRow, updateRow, deleteRow, uploadImage, fmtTime } from "../../api";
import { useLiveReload } from "../../live";
import { Button, Input, Textarea, Label, Modal, Badge, EmptyState, Loading, toast } from "../../components/ui";
import {
  Plus, Trash2, FileText, Paperclip, Loader2, CheckCircle2, Folder, ChevronDown, ChevronRight, Search, Link2,
} from "lucide-react";

const EMPTY = { name: "", target_role: "", file_url: "", content: "", note: "", folder: "" };
const LOOSE = "未分组";
const ARCHIVE = "按天归档";

// 「投递_2026-11-19」「投递-2026-11-19」这类按天建的文件夹，攒多了会挤在列表最前面
const isDailyFolder = (folder) => /^投递[-_]?\d{4}[-.]?\d{1,2}[-.]?\d{1,2}/.test(String(folder || "").trim());

export default function Resumes({ onJumpToResume }) {
  const [rows, setRows] = useState([]);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [collapsed, setCollapsed] = useState({ [ARCHIVE]: true });
  const [q, setQ] = useState("");
  const fileRef = useRef(null);

  const load = async ({ silent = false } = {}) => {
    try {
      const [rs, js] = await Promise.all([listRows("resumes"), listRows("job_apps").catch(() => [])]);
      setRows(rs);
      setApps(js);
    } catch (e) {
      if (!silent) toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(() => load({ silent: true }));

  // 每份简历被多少个岗位引用（resume_id 存的是 number，老数据可能是字符串，统一转一下）
  const refCount = useMemo(() => {
    const map = new Map();
    apps.forEach((a) => {
      const id = Number(a.resume_id);
      if (!id) return;
      map.set(id, (map.get(id) || 0) + 1);
    });
    return map;
  }, [apps]);

  // in_use 兜底：万一有多条在用的，只认 updated_at 最新那条，其余静默忽略
  const { inUseId, dupInUse } = useMemo(() => {
    const list = rows.filter((r) => r.in_use);
    if (!list.length) return { inUseId: null, dupInUse: 0 };
    const sorted = [...list].sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
    return { inUseId: sorted[0].id, dupInUse: list.length - 1 };
  }, [rows]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b.id === inUseId ? 1 : 0) - (a.id === inUseId ? 1 : 0) || String(b.created_at).localeCompare(String(a.created_at))),
    [rows, inUseId]
  );

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return sorted;
    return sorted.filter((r) => [r.name, r.target_role, r.folder, r.note].some((v) => String(v || "").toLowerCase().includes(kw)));
  }, [sorted, q]);

  // 分组：按方向文件夹聚，「投递_DATE」这类按天的收进一个折叠区，未分组排最后
  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => {
      const folder = String(r.folder || "").trim();
      const key = isDailyFolder(folder) ? ARCHIVE : folder || LOOSE;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    const rank = (k) => (k === LOOSE ? 3 : k === ARCHIVE ? 2 : /通用/.test(k) ? 0 : 1);
    return [...map.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0], "zh-CN"));
  }, [filtered]);

  const folders = useMemo(
    () => [...new Set(rows.map((r) => String(r.folder || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [rows]
  );

  const openNew = () => { setForm(EMPTY); setEditingId(null); setOpen(true); };
  const openEdit = (r) => {
    setForm({
      name: r.name || "", target_role: r.target_role || "", file_url: r.file_url || "",
      content: r.content || "", note: r.note || "", folder: r.folder || "",
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
        folder: form.folder.trim(),
      };
      if (editingId) {
        await updateRow("resumes", editingId, payload);
        toast.success("已更新");
      } else {
        await insertRow("resumes", { ...payload, in_use: rows.length === 0 });
        toast.success("已保存");
      }
      setOpen(false);
      load({ silent: true });
    } catch (e) {
      toast.error("保存失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  const setInUse = async (r) => {
    try {
      // 无论当前有几条在用，全清掉再设这一条，保证唯一
      await Promise.all(rows.filter((x) => x.in_use && x.id !== r.id).map((x) => updateRow("resumes", x.id, { in_use: false })));
      await updateRow("resumes", r.id, { in_use: !r.in_use });
      load({ silent: true });
    } catch (e) {
      toast.error("更新失败：" + e.message);
    }
  };

  const remove = async (r) => {
    const n = refCount.get(r.id) || 0;
    const extra = n ? `\n有 ${n} 个岗位记录关联了这份简历，删掉后它们会失去简历版本（岗位记录本身不会删）。` : "";
    if (!window.confirm(`删除简历「${r.name}」？${extra}`)) return;
    try {
      await deleteRow("resumes", r.id);
      toast.success("已删除");
      load({ silent: true });
    } catch (e) {
      toast.error("删除失败：" + e.message);
    }
  };

  return (
    <>
      <PageHeader
        title="简历库"
        subtitle={`${rows.length} 份版本${inUseId ? " · 1 份在用" : ""}，投递时清楚用的是哪一版`}
        action={<Button onClick={openNew}><Plus className="h-4 w-4" /> 添加简历</Button>}
      />

      {dupInUse > 0 ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          发现 {dupInUse + 1} 份标记为在用，已按最近更新的那份显示。其余的点「设为在用」会一并纠正。
        </p>
      ) : null}

      {rows.length ? (
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜简历名 / 目标岗位 / 文件夹 / 备注" className="pl-8" />
        </div>
      ) : null}

      {loading ? (
        <Loading />
      ) : sorted.length === 0 ? (
        <EmptyState icon={FileText} text="还没有简历版本，上传第一份吧（支持 PDF / Word）" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} text={`没有匹配「${q.trim()}」的简历`} />
      ) : (
        <div className="space-y-5">
          {groups.map(([folder, list]) => {
            const shut = !!collapsed[folder];
            return (
              <section key={folder}>
                <button
                  type="button"
                  onClick={() => setCollapsed((c) => ({ ...c, [folder]: !c[folder] }))}
                  className="mb-2 flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-slate-50"
                >
                  {shut ? <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
                  <Folder className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate text-sm font-medium text-slate-700">{folder}</span>
                  <Badge>{list.length}</Badge>
                  {list.some((r) => r.id === inUseId) ? <span className="text-[11px] text-terracotta">含在用版本</span> : null}
                </button>
                {shut ? null : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {list.map((r) => {
                      const using = r.id === inUseId;
                      const n = refCount.get(r.id) || 0;
                      return (
                        <div key={r.id} className={`group rounded-xl border p-4 transition-shadow hover:shadow-soft ${using ? "border-terracotta-200 bg-terracotta-50/40" : "border-slate-200 bg-white"}`}>
                          <div className="mb-1.5 flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="flex items-center gap-1.5 truncate font-medium text-slate-900">
                                {r.name}
                                {using ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-terracotta" /> : null}
                              </h3>
                              <p className="text-xs text-slate-400">{r.target_role || "未标注目标岗位"}</p>
                            </div>
                            <Badge className={using ? "shrink-0 bg-terracotta text-white" : "shrink-0"}>{using ? "当前在用" : "备用"}</Badge>
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
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1 text-xs text-slate-400">
                                <FileText className="h-3 w-3" /> 仅文本版
                              </span>
                            )}
                            {n ? (
                              <button
                                onClick={() => onJumpToResume?.(r)}
                                title="去全量视图看这些岗位"
                                className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-terracotta-600"
                              >
                                <Link2 className="h-3 w-3" /> 被 {n} 个岗位引用
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-300">还没被任何岗位引用</span>
                            )}
                            <button
                              onClick={() => setInUse(r)}
                              className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                            >
                              {using ? "取消在用" : "设为在用"}
                            </button>
                            <span className="ml-auto text-[11px] text-slate-300">{fmtTime(r.created_at)}</span>
                            <div className="flex gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                              <button onClick={() => openEdit(r)} className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100">编辑</button>
                              <button onClick={() => remove(r)} className="rounded px-1.5 py-1 text-slate-300 hover:bg-red-50 hover:text-red-400">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
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
            <Label>文件夹（可选）</Label>
            <Input
              list="resume-folder-options"
              value={form.folder}
              onChange={(e) => setForm({ ...form, folder: e.target.value })}
              placeholder="如：定向版_剪映_AI产品经理；留空则归入未分组"
            />
            <datalist id="resume-folder-options">
              {folders.map((f) => <option key={f} value={f} />)}
            </datalist>
            <p className="mt-1 text-[11px] text-slate-400">同一个文件夹的简历会摆在一起；「投递_日期」这类会收进「按天归档」。</p>
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
