import { useEffect, useMemo, useRef, useState } from "react";
import Layout, { PageHeader } from "../components/Layout";
import MarkdownLite from "../components/MarkdownLite";
import { listRows, insertRow, updateRow, deleteRow, fmtTime, uploadImage } from "../api";
import { useLiveReload } from "../live";
import {
  Button, Input, Textarea, Label, Modal, EmptyState, Loading, toast,
} from "../components/ui";
import { Plus, Search, BookOpen, Pencil, Trash2, ImagePlus, Loader2, Sparkles, Download } from "lucide-react";
import { downloadText, safeName } from "../download";

const CATEGORIES = ["技术学习", "求职经验", "项目复盘", "工具技巧", "其他"];

// 分类配色：列表、筛选、详情三处统一，扫一眼就能区分板块
const CAT_TINT = {
  技术学习: { chip: "border-sky-200 bg-sky-50 text-sky-700", edge: "border-l-sky-400" },
  求职经验: { chip: "border-amber-200 bg-amber-50 text-amber-700", edge: "border-l-amber-400" },
  项目复盘: { chip: "border-violet-200 bg-violet-50 text-violet-700", edge: "border-l-violet-400" },
  工具技巧: { chip: "border-emerald-200 bg-emerald-50 text-emerald-700", edge: "border-l-emerald-400" },
  其他: { chip: "border-slate-200 bg-slate-100 text-slate-500", edge: "border-l-slate-300" },
};
const tintOf = (c) => {
  if (CAT_TINT[c]) return CAT_TINT[c];
  // 自定义分类（如「技术阅读」）：按名字哈希取一个稳定颜色，不再一律灰
  let h = 0;
  for (const ch of String(c || "")) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return [CAT_TINT["技术学习"], CAT_TINT["求职经验"], CAT_TINT["项目复盘"], CAT_TINT["工具技巧"]][h % 4];
};
const EMPTY = { title: "", category: "技术学习", tags: "", content: "" };

export default function KnowledgeBase() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("全部");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = async () => {
    try {
      setArticles(await listRows("kb_articles"));
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return articles.filter((a) => {
      if (cat !== "全部" && a.category !== cat) return false;
      if (!kw) return true;
      return [a.title, a.tags, a.content, a.category].join(" ").toLowerCase().includes(kw);
    });
  }, [articles, q, cat]);

  // 下载：单篇 / 全部（Markdown，带分类、标签、时间元信息）
  const toMd = (a) =>
    [
      `# ${a.title}`,
      "",
      `> 分类：${a.category || "未分类"}${a.tags ? ` · 标签：${a.tags}` : ""}`,
      `> 记录时间：${fmtTime(a.created_at)}`,
      "",
      "---",
      "",
      a.content || "（无正文）",
      "",
    ].join("\n");

  const downloadOne = (a) => {
    downloadText(`${safeName(a.title, "知识库文章")}.md`, toMd(a));
    toast.success("已开始下载 Markdown");
  };

  const downloadAll = () => {
    if (!filtered.length) return toast.error("当前筛选下没有文章");
    const md = filtered.map(toMd).join("\n\n");
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`知识库-${filtered.length}篇-${stamp}.md`, md);
    toast.success(`已导出 ${filtered.length} 篇`);
  };

  const openNew = () => { setForm(EMPTY); setEditingId(null); setAiResult(null); setFormOpen(true); };
  const openEdit = (a) => {
    setForm({ title: a.title || "", category: a.category || "其他", tags: a.tags || "", content: a.content || "" });
    setEditingId(a.id);
    setAiResult(null);
    setFormOpen(true);
  };

  // AI 摘要：基于正文生成标签，并弹出摘要预览
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const aiSummarize = async () => {
    if (!form.content || form.content.length < 50) return toast.error("正文太短，先写点内容再摘要");
    setAiBusy(true);
    setAiResult(null);
    try {
      const r = await api.aiSummarize(form.content);
      setAiResult(r);
      if (r.tags?.length) setForm((f) => ({ ...f, tags: r.tags.join(", ") }));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAiBusy(false);
    }
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error("请填写标题");
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        tags: form.tags.trim(),
        content: form.content,
        updated_at: new Date().toISOString(),
      };
      if (editingId) {
        await updateRow("kb_articles", editingId, payload);
        toast.success("已更新");
      } else {
        await insertRow("kb_articles", payload);
        toast.success("已收录到知识库");
      }
      setFormOpen(false);
      load();
    } catch (e) {
      toast.error("保存失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a) => {
    if (!window.confirm(`确定删除「${a.title}」？此操作不可恢复。`)) return;
    try {
      await deleteRow("kb_articles", a.id);
      toast.success("已删除");
      setViewing(null);
      load();
    } catch (e) {
      toast.error("删除失败：" + e.message);
    }
  };

  const catCount = (c) => (c === "全部" ? articles.length : articles.filter((a) => a.category === c).length);

  const onPickImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setForm((f) => ({
        ...f,
        content: (f.content ? f.content.replace(/\s*$/, "") + "\n\n" : "") + `![${file.name.replace(/\.[^.]+$/, "")}](${url})\n`,
      }));
      toast.success("图片已插入正文");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="在线知识库"
        subtitle="沉淀问答、经验与资料，支持 Markdown 格式"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={downloadAll} className="px-2 sm:px-3">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">导出全部</span>
            </Button>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> 新建文章
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {["全部", ...CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                cat === c
                  ? c === "全部"
                    ? "border-transparent bg-terracotta font-medium text-white"
                    : `${tintOf(c).chip} font-medium`
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {c} · {catCount(c)}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索标题、标签或正文…" className="pl-9" />
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState icon={BookOpen} text="暂无文章，点击右上角「新建文章」开始沉淀" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((a) => {
            const tint = tintOf(a.category);
            return (
            <div
              key={a.id}
              className={`group cursor-pointer rounded-xl border border-l-[3px] border-slate-200/70 ${tint.edge} bg-white/80 p-4 transition-shadow hover:shadow-soft`}
              onClick={() => setViewing(a)}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="text-[15px] font-semibold leading-snug text-slate-900">{a.title}</h3>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${tint.chip}`}>
                  {a.category || "未分类"}
                </span>
              </div>
              <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-slate-600">
                {(a.content || "").replace(/[#*`>-]/g, "").slice(0, 120) || "（无正文）"}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {(a.tags || "").split(/[,，]/).filter(Boolean).slice(0, 3).map((t) => (
                    <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                      #{t.trim()}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(a); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); remove(a); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">{fmtTime(a.created_at)}</p>
            </div>
            );
          })}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editingId ? "编辑文章" : "新建文章"} wide>
        <div className="space-y-4">
          <div>
            <Label>标题</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="这篇文章讲什么？" />
          </div>
          <div>
            <Label>分类</Label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, category: c })}
                  className={`rounded-full px-3 py-1 text-xs ${
                    form.category === c ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label>标签（逗号分隔）</Label>
              <button
                type="button"
                onClick={aiSummarize}
                disabled={aiBusy}
                className="inline-flex items-center gap-1 rounded-lg bg-terracotta-50 px-2.5 py-1.5 text-xs font-medium text-terracotta-700 transition-colors hover:bg-terracotta-100 disabled:opacity-60"
                title="基于正文自动生成标签与摘要"
              >
                {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {aiBusy ? "AI 思考中…" : "AI 摘要与标签"}
              </button>
            </div>
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="如：React, 中间件, 面试" />
            {aiResult ? (
              <div className="mt-2 rounded-lg border border-terracotta-100 bg-terracotta-50/60 p-2.5 text-xs leading-relaxed text-slate-600">
                <p className="font-medium text-slate-700">{aiResult.summary}</p>
                {aiResult.points?.length ? (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {aiResult.points.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label>正文（支持 Markdown / 图片 / 链接）</Label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-60"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                {uploading ? "上传中…" : "插入图片"}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
            </div>
            <Textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder={"## 要点\n- 第一点\n- 第二点\n\n**重点**用双星号加粗"}
              rows={12}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
            <Button onClick={save} loading={saving}>保存</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.title || ""} wide>
        {viewing ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${tintOf(viewing.category).chip}`}>
                {viewing.category || "未分类"}
              </span>
              {(viewing.tags || "").split(/[,，]/).filter(Boolean).map((t) => (
                <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">#{t.trim()}</span>
              ))}
              <span className="text-xs text-slate-400">{fmtTime(viewing.created_at)}</span>
              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="sm" title="下载 Markdown" onClick={() => downloadOne(viewing)}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(viewing)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="danger" size="sm" onClick={() => remove(viewing)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            <MarkdownLite text={viewing.content} />
          </>
        ) : null}
      </Modal>
    </Layout>
  );
}
