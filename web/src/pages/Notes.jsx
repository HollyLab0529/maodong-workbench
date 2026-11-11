import { useEffect, useMemo, useState } from "react";
import Layout, { PageHeader } from "../components/Layout";
import { listRows, insertRow, updateRow, deleteRow, fmtTime, fetchMeta, api } from "../api";
import { useLiveReload } from "../live";
import { Button, Input, Textarea, Label, Badge, Modal, EmptyState, Loading, toast } from "../components/ui";
import {
  Plus, Trash2, Lightbulb, BookMarked, MessagesSquare, CalendarDays, Link2, ArrowUpCircle, Wand2, Sparkles, ScrollText,
  Pencil, Tags, X, GripVertical,
} from "lucide-react";
import { tagChip, useTagColors } from "../colors";

const NOTE_TYPES = [
  { type: "灵感想法", icon: Lightbulb, fields: [
    { key: "content", label: "想法内容", multiline: true },
    { key: "context", label: "背景触发点", multiline: false },
  ]},
  { type: "学习摘录", icon: BookMarked, fields: [
    { key: "source", label: "来源（文章/文档/链接）", multiline: false },
    { key: "content", label: "摘录要点", multiline: true },
    { key: "reflection", label: "我的理解", multiline: true },
  ]},
  { type: "沟通记录", icon: MessagesSquare, fields: [
    { key: "with_whom", label: "对象/场合", multiline: false },
    { key: "content", label: "关键内容", multiline: true },
    { key: "action", label: "后续行动项", multiline: false },
  ]},
  { type: "日常事务", icon: CalendarDays, fields: [
    { key: "content", label: "事项内容", multiline: true },
    { key: "deadline", label: "相关人/时间点", multiline: false },
  ]},
  { type: "收藏链接", icon: Link2, fields: [
    { key: "url", label: "链接", multiline: false },
    { key: "reason", label: "为什么收藏", multiline: true },
  ]},
  { type: "改动日志", icon: ScrollText, fields: [
    { key: "content", label: "本次改动", multiline: true },
  ]},
];

// 类型配色：筛选、卡片徽标、左侧色条、图标四处统一
const NOTE_TINT = {
  灵感想法: { chip: "border-amber-200 bg-amber-50 text-amber-700", edge: "border-l-amber-400", icon: "text-amber-500" },
  学习摘录: { chip: "border-sky-200 bg-sky-50 text-sky-700", edge: "border-l-sky-400", icon: "text-sky-500" },
  沟通记录: { chip: "border-violet-200 bg-violet-50 text-violet-700", edge: "border-l-violet-400", icon: "text-violet-500" },
  日常事务: { chip: "border-emerald-200 bg-emerald-50 text-emerald-700", edge: "border-l-emerald-400", icon: "text-emerald-500" },
  收藏链接: { chip: "border-rose-200 bg-rose-50 text-rose-700", edge: "border-l-rose-400", icon: "text-rose-500" },
  改动日志: { chip: "border-slate-300 bg-slate-100 text-slate-600", edge: "border-l-slate-400", icon: "text-slate-500" },
};
const noteTint = (t) => NOTE_TINT[t] || NOTE_TINT["灵感想法"];

const splitTags = (s) => (s || "").split(/[,，]/).map((t) => t.trim()).filter(Boolean);

export default function Notes() {
  useTagColors();
  const [notes, setNotes] = useState([]);
  const [tagLib, setTagLib] = useState([]); // 全局标签库 [{id, name, sort}]
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("全部");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null); // 正在编辑的笔记（null = 新建）
  const [ntype, setNtype] = useState("灵感想法");
  const [title, setTitle] = useState("");
  const [tagArr, setTagArr] = useState([]); // 弹窗内已选标签
  const [tagInput, setTagInput] = useState("");
  const [fields, setFields] = useState({});
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [coverErrors, setCoverErrors] = useState({});
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [tagMgrOpen, setTagMgrOpen] = useState(false);

  const load = async () => {
    try {
      setNotes(await listRows("quick_notes"));
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  const loadTags = async () => {
    try {
      setTagLib(await listRows("note_tags"));
    } catch {
      /* 标签库加载失败不阻塞页面 */
    }
  };
  useEffect(() => { load(); loadTags(); }, []);
  useLiveReload(load);

  // 标签库顺序（sort 升序），卡片与候选都按这个顺序展示
  const tagOrder = useMemo(() => {
    const m = new Map(tagLib.map((t, i) => [t.name, t.sort ?? i]));
    return (a, b) => (m.has(a) ? m.get(a) : 9999) - (m.has(b) ? m.get(b) : 9999) || a.localeCompare(b);
  }, [tagLib]);

  const typeDef = useMemo(() => NOTE_TYPES.find((t) => t.type === ntype) || NOTE_TYPES[0], [ntype]);
  const filtered = useMemo(() => (filter === "全部" ? notes : notes.filter((n) => n.ntype === filter)), [notes, filter]);

  const resetForm = () => { setNtype("灵感想法"); setTitle(""); setTagArr([]); setTagInput(""); setFields({}); };

  const openNew = () => { setEditing(null); resetForm(); setOpen(true); };

  // 点卡片 → 展开成弹窗编辑，预填全部字段
  const openEdit = (n) => {
    setEditing(n);
    setNtype(n.ntype);
    setTitle(n.title);
    setTagArr(splitTags(n.tags));
    setTagInput("");
    setFields(parseFields(n));
    setOpen(true);
  };

  const save = async () => {
    if (!title.trim()) return toast.error("请填写标题");
    const main = typeDef.fields.find((f) => f.key === "content" || f.key === "url");
    if (main && !String(fields[main.key] || "").trim()) return toast.error(`请填写「${main.label}」`);
    setSaving(true);
    const row = {
      ntype, title: title.trim(), tags: tagArr.join(", "),
      content: JSON.stringify(fields), promoted: editing ? editing.promoted : false,
    };
    try {
      if (editing) {
        await updateRow("quick_notes", editing.id, row);
        toast.success("已更新");
      } else {
        await insertRow("quick_notes", row);
        toast.success("已记录");
      }
      // 新标签顺手收进标签库，保持「新增」能力
      const known = new Set(tagLib.map((t) => t.name));
      const fresh = tagArr.filter((t) => !known.has(t));
      for (const name of fresh) {
        try {
          await insertRow("note_tags", { name, sort: tagLib.length + fresh.indexOf(name) });
        } catch { /* 收录失败不影响保存 */ }
      }
      if (fresh.length) loadTags();
      setOpen(false);
      setEditing(null);
      load();
    } catch (e) {
      toast.error("保存失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  const parseFields = (n) => {
    try { return JSON.parse(n.content || "{}"); } catch { return { content: n.content || "" }; }
  };

  const autoFetch = async () => {
    const url = (fields.url || "").trim();
    if (!/^https?:\/\//.test(url)) return toast.error("请先填写合法的 http/https 链接");
    setFetching(true);
    try {
      const meta = await fetchMeta(url);
      setFields((f) => ({
        ...f,
        og_image: meta.image || "",
        reason: f.reason ? f.reason : meta.description || "",
      }));
      if (!title.trim() && meta.title) setTitle(meta.title);
      toast.success(meta.title ? "已获取链接信息" : "抓取成功（未取到标题，请手动填写）");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setFetching(false);
    }
  };

  const promote = async (n) => {
    if (!window.confirm(`将「${n.title}」升级为知识库文章？`)) return;
    try {
      const f = parseFields(n);
      const def = NOTE_TYPES.find((t) => t.type === n.ntype) || NOTE_TYPES[0];
      const md = def.fields.filter((fd) => f[fd.key]).map((fd) => `## ${fd.label}\n${f[fd.key]}`).join("\n\n");
      await insertRow("kb_articles", {
        title: n.title,
        category: "其他",
        tags: (n.tags || "") + (n.tags ? "," : "") + "随笔记",
        content: md || f.content || "",
        updated_at: new Date().toISOString(),
      });
      await updateRow("quick_notes", n.id, { promoted: true });
      toast.success("已升级为知识库文章");
      load();
    } catch (e) {
      toast.error("升级失败：" + e.message);
    }
  };

  const remove = async (n) => {
    if (!window.confirm(`删除笔记「${n.title}」？`)) return;
    try {
      await deleteRow("quick_notes", n.id);
      if (editing && editing.id === n.id) { setOpen(false); setEditing(null); }
      load();
    } catch (e) {
      toast.error("删除失败：" + e.message);
    }
  };

  // AI 整理：一段乱文字（如语音转写）→ 标题 / 类型 / 正文 / 标签，预填弹窗
  const NT_MAP = { 灵感: "灵感想法", 踩坑: "学习摘录", 待整理: "日常事务", 生活: "日常事务" };
  const quickTidy = async () => {
    const t = aiText.trim();
    if (t.length < 4) return toast.error("先粘贴或输入要整理的内容");
    setAiBusy(true);
    try {
      const r = await api.aiTidyNote(t);
      setEditing(null);
      setNtype(NT_MAP[r.ntype] || "灵感想法");
      setTitle(r.title || "");
      setTagArr(r.tags || []);
      setTagInput("");
      setFields({ content: r.content || t });
      setOpen(true);
      setAiText("");
      toast.success("AI 已整理，可修改后保存");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAiBusy(false);
    }
  };

  const countOf = (t) => (t === "全部" ? notes.length : notes.filter((n) => n.ntype === t).length);

  // ---- 标签管理：新增 / 改名 / 删除 / 拖拽排序 ----
  const sortedTagLib = useMemo(() => [...tagLib].sort(tagOrder), [tagLib, tagOrder]);

  const addLibTag = async () => {
    const name = tagInput.trim().replace(/^#/, "");
    if (!name) return;
    if (tagLib.some((t) => t.name === name)) return toast.error("标签已存在");
    try {
      await insertRow("note_tags", { name, sort: tagLib.length });
      setTagInput("");
      loadTags();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const renameLibTag = async (row, newName) => {
    newName = newName.trim();
    if (!newName || newName === row.name) return;
    if (tagLib.some((t) => t.name === newName)) return toast.error("已有同名标签");
    try {
      await updateRow("note_tags", row.id, { name: newName });
      for (const n of notes) {
        const ts = splitTags(n.tags);
        if (ts.includes(row.name)) {
          await updateRow("quick_notes", n.id, { tags: ts.map((t) => (t === row.name ? newName : t)).join(", ") });
        }
      }
      loadTags(); load();
      toast.success(`已改名并同步 ${notes.length ? "相关笔记" : ""}`);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const removeLibTag = async (row) => {
    const used = notes.filter((n) => splitTags(n.tags).includes(row.name)).length;
    if (!window.confirm(used ? `删除标签「${row.name}」？${used} 条笔记上的该标签会一并移除。` : `删除标签「${row.name}」？`)) return;
    try {
      for (const n of notes) {
        const ts = splitTags(n.tags);
        if (ts.includes(row.name)) await updateRow("quick_notes", n.id, { tags: ts.filter((t) => t !== row.name).join(", ") });
      }
      await deleteRow("note_tags", row.id);
      loadTags(); load();
      toast.success("已删除");
    } catch (e) {
      toast.error(e.message);
    }
  };

  // 拖拽排序：drop 时整批写回 sort
  const [dragIdx, setDragIdx] = useState(null);
  const reorderLibTag = async (from, to) => {
    if (from === to) return;
    const next = [...sortedTagLib];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setTagLib(next.map((t, i) => ({ ...t, sort: i }))); // 乐观更新
    try {
      await Promise.all(next.map((t, i) => updateRow("note_tags", t.id, { sort: i })));
      loadTags();
    } catch (e) {
      toast.error("排序保存失败：" + e.message);
      loadTags();
    }
  };

  // ---- 弹窗内标签输入 ----
  const addTagFromInput = () => {
    const parts = splitTags(tagInput);
    if (!parts.length) return;
    setTagArr((arr) => [...new Set([...arr, ...parts])]);
    setTagInput("");
  };
  const toggleTag = (name) =>
    setTagArr((arr) => (arr.includes(name) ? arr.filter((t) => t !== name) : [...arr, name]));

  const candidates = sortedTagLib.filter((t) => !tagArr.includes(t.name));

  const cardTags = (n) => splitTags(n.tags).sort(tagOrder);

  return (
    <Layout>
      <PageHeader
        title="随笔记"
        subtitle="结构化速记：选类型、按模板填，积累后可升级为知识库文章"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setTagMgrOpen(true)}><Tags className="h-4 w-4" /> 标签管理</Button>
            <Button onClick={openNew}><Plus className="h-4 w-4" /> 记一条</Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {["全部", ...NOTE_TYPES.map((t) => t.type)].map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              filter === t
                ? t === "全部"
                  ? "border-transparent bg-terracotta font-medium text-white"
                  : `font-medium ${noteTint(t).chip}`
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t} · {countOf(t)}
          </button>
        ))}
      </div>

      {/* AI 整理乱文字 */}
      <div className="mb-5 flex items-start gap-2 rounded-xl border border-terracotta-100 bg-terracotta-50/50 p-3">
        <Sparkles className="mt-1.5 h-4 w-4 shrink-0 text-terracotta" />
        <textarea
          value={aiText}
          onChange={(e) => setAiText(e.target.value)}
          placeholder="把想到的随手丢进来（语音转写、零散句子都行），AI 帮你理成一条结构化随记…"
          rows={2}
          className="min-w-0 flex-1 resize-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
        />
        <Button size="sm" onClick={quickTidy} loading={aiBusy} className="shrink-0">
          整理
        </Button>
      </div>

      {loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Lightbulb} text="还没有笔记，点「记一条」按模板快速记录" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((n) => {
            const def = NOTE_TYPES.find((t) => t.type === n.ntype) || NOTE_TYPES[0];
            const f = parseFields(n);
            const cover = f.og_image && !coverErrors[n.id];
            return (
              <div
                key={n.id}
                onClick={() => openEdit(n)}
                title="点击展开编辑"
                className={`group cursor-pointer rounded-xl border border-l-[3px] border-slate-200/70 ${noteTint(n.ntype).edge} bg-white/80 p-4 transition-shadow hover:shadow-md`}
              >
                {cover ? (
                  <img
                    src={f.og_image}
                    alt=""
                    loading="lazy"
                    className="mb-3 h-32 w-full rounded-lg object-cover"
                    onError={() => setCoverErrors((m) => ({ ...m, [n.id]: true }))}
                  />
                ) : null}
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <def.icon className={`h-4 w-4 shrink-0 ${noteTint(n.ntype).icon}`} />
                    <h3 className="font-medium leading-snug text-slate-900">{n.title}</h3>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${noteTint(n.ntype).chip}`}>{n.ntype}</span>
                </div>
                <div className="mb-2 space-y-1">
                  {def.fields.map((fd) =>
                    f[fd.key] ? (
                      <p key={fd.key} className="whitespace-pre-line break-words text-xs leading-relaxed text-slate-500">
                        <span className="text-slate-300">{fd.label}：</span>
                        {fd.key === "url" && /^https?:\/\//.test(f[fd.key]) ? (
                          <a
                            href={f[fd.key]}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="break-all text-terracotta-600 underline"
                          >
                            {f[fd.key]}
                          </a>
                        ) : (
                          String(f[fd.key]).slice(0, 260)
                        )}
                      </p>
                    ) : null
                  )}
                </div>
                {/* 底部：标签 + 徽标 | 时间 + 编辑/升级/删除 */}
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {cardTags(n).slice(0, 4).map((t) => (
                      <span key={t} className={`rounded px-1.5 py-0.5 text-[11px] ${tagChip(t)}`}>#{t}</span>
                    ))}
                    {n.promoted ? <Badge className="bg-green-50 text-green-600">已进知识库</Badge> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-[11px] text-slate-300">{fmtTime(n.created_at)}</span>
                    <button
                      title="编辑"
                      onClick={(e) => { e.stopPropagation(); openEdit(n); }}
                      className="ml-1 text-slate-300 transition-colors hover:text-terracotta-600"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {!n.promoted ? (
                      <button
                        title="升级为知识库文章"
                        onClick={(e) => { e.stopPropagation(); promote(n); }}
                        className="text-slate-300 transition-colors hover:text-terracotta-600"
                      >
                        <ArrowUpCircle className="h-4 w-4" />
                      </button>
                    ) : null}
                    <button
                      onClick={(e) => { e.stopPropagation(); remove(n); }}
                      className="text-slate-200 transition-colors hover:text-red-400 group-hover:text-slate-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 新建 / 编辑共用弹窗 */}
      <Modal open={open} onClose={() => { setOpen(false); setEditing(null); }} title={editing ? "编辑笔记" : "记一条"}>
        <div className="space-y-4">
          <div>
            <Label>类型</Label>
            <div className="flex flex-wrap gap-1.5">
              {NOTE_TYPES.map((t) => (
                <button
                  key={t.type}
                  onClick={() => { setNtype(t.type); if (!editing) setFields({}); }}
                  className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    ntype === t.type ? `font-medium ${noteTint(t.type).chip}` : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" /> {t.type}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>标题</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="一句话概括这条笔记，如：2026年11月11日更新内容" />
          </div>
          {typeDef.fields.map((fd) => (
            <div key={fd.key}>
              <Label>{fd.label}</Label>
              {fd.multiline ? (
                <Textarea value={fields[fd.key] || ""} onChange={(e) => setFields({ ...fields, [fd.key]: e.target.value })} rows={3} />
              ) : (
                <Input value={fields[fd.key] || ""} onChange={(e) => setFields({ ...fields, [fd.key]: e.target.value })} />
              )}
            </div>
          ))}
          <div>
            <Label>标签</Label>
            {tagArr.length ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {tagArr.map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleTag(t)}
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${tagChip(t)}`}
                    title="点击移除"
                  >
                    #{t} <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTagFromInput(); } }}
                placeholder="输入新标签，回车添加"
              />
              <Button type="button" variant="outline" onClick={addTagFromInput}>添加</Button>
            </div>
            {candidates.length ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400">常用：</span>
                {candidates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t.name)}
                    className={`rounded px-1.5 py-0.5 text-[11px] opacity-80 transition-opacity hover:opacity-100 ${tagChip(t.name)}`}
                  >
                    + {t.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {ntype === "收藏链接" ? (
            <div className="rounded-lg border border-terracotta-100 bg-terracotta-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] leading-relaxed text-terracotta-700">
                  粘贴链接后点「自动获取」，可抓取网页标题、摘要和封面图。
                </p>
                <Button type="button" variant="outline" size="sm" onClick={autoFetch} loading={fetching} className="shrink-0">
                  <Wand2 className="h-3.5 w-3.5" /> 自动获取
                </Button>
              </div>
              {fields.og_image ? (
                <img src={fields.og_image} alt="" className="h-28 w-full rounded-md object-cover" />
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setOpen(false); setEditing(null); }}>取消</Button>
            <Button onClick={save} loading={saving}>{editing ? "保存修改" : "保存"}</Button>
          </div>
        </div>
      </Modal>

      {/* 标签管理弹窗：拖拽排序 / 改名 / 删除 / 新增 */}
      <Modal open={tagMgrOpen} onClose={() => setTagMgrOpen(false)} title="标签管理">
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-slate-500">
            拖住 ⠿ 上下移动调整顺序；双击名称可改名（会同步到所有笔记）；删除会同时移除各笔记上的该标签。
          </p>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLibTag(); } }}
              placeholder="新标签名称"
            />
            <Button onClick={addLibTag}><Plus className="h-4 w-4" /> 新增</Button>
          </div>
          {sortedTagLib.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-400">还没有标签，先新增几个，如：作品集、工作台</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
              {sortedTagLib.map((t, i) => (
                <LibTagRow
                  key={t.id}
                  row={t}
                  index={i}
                  total={sortedTagLib.length}
                  dragIdx={dragIdx}
                  setDragIdx={setDragIdx}
                  onDrop={() => { if (dragIdx !== null) reorderLibTag(dragIdx, i); setDragIdx(null); }}
                  onRename={renameLibTag}
                  onRemove={removeLibTag}
                  usedCount={notes.filter((n) => splitTags(n.tags).includes(t.name)).length}
                />
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </Layout>
  );
}

// 标签管理单行：拖拽手柄 + 可改名名称 + 删除
function LibTagRow({ row, index, dragIdx, setDragIdx, onDrop, onRename, onRemove, usedCount }) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(row.name);
  useEffect(() => setName(row.name), [row.name]);

  const commit = () => { setEditingName(false); onRename(row, name); };

  return (
    <li
      draggable={!editingName}
      onDragStart={() => setDragIdx(index)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onDragEnd={() => setDragIdx(null)}
      className={`flex items-center gap-2 px-3 py-2 ${dragIdx === index ? "bg-terracotta-50" : "bg-white"}`}
    >
      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-300" title="拖动排序" />
      {editingName ? (
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { setName(row.name); setEditingName(false); } }}
          className="h-7 flex-1 text-sm"
        />
      ) : (
        <button
          onClick={() => setEditingName(true)}
          onDoubleClick={() => setEditingName(true)}
          title="点击改名"
          className={`flex-1 truncate rounded px-1 py-0.5 text-left text-sm transition-colors hover:bg-slate-50 ${tagChip(row.name)}`}
        >
          #{row.name}
        </button>
      )}
      <span className="shrink-0 text-[11px] text-slate-300">{usedCount ? `${usedCount} 条` : "未使用"}</span>
      <button
        onClick={() => onRemove(row)}
        title="删除标签"
        className="shrink-0 text-slate-200 transition-colors hover:text-red-400"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
