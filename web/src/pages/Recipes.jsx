import { useEffect, useMemo, useState } from "react";
import Layout, { PageHeader } from "../components/Layout";
import { listRows, insertRow, updateRow, deleteRow, api } from "../api";
import { useLiveReload } from "../live";
import { Button, Input, Textarea, Label, Modal, EmptyState, Loading, toast } from "../components/ui";
import MarkdownLite from "../components/MarkdownLite";
import { Plus, Trash2, Pencil, ChefHat, Star, Clock3, ShoppingBasket, Copy, Check, Loader2, Sparkles } from "lucide-react";
import { tagChip } from "../colors";

const TYPES = ["家常", "快手", "烘焙", "汤", "早餐", "甜品"];
const EMPTY = { title: "", type: "家常", ingredients: "", steps: "", tags: "", rating: 0 };

export default function Recipes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("全部");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [shopOpen, setShopOpen] = useState(false);
  const [shopBusy, setShopBusy] = useState(false);
  const [shopContent, setShopContent] = useState("");
  const [copied, setCopied] = useState(false);

  const load = async () => {
    try {
      const r = await listRows("recipes");
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
    () => (filter === "全部" ? rows : rows.filter((r) => r.type === filter)),
    [rows, filter]
  );

  const openNew = () => { setForm(EMPTY); setEditingId(null); setOpen(true); };
  const openEdit = (r) => {
    setForm({
      title: r.title || "", type: r.type || "家常", ingredients: r.ingredients || "",
      steps: r.steps || "", tags: r.tags || "", rating: Number(r.rating) || 0,
    });
    setEditingId(r.id);
    setOpen(true);
    setDetail(null);
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error("给菜起个名字");
    setSaving(true);
    try {
      const payload = { ...form, title: form.title.trim() };
      if (editingId) await updateRow("recipes", editingId, payload);
      else await insertRow("recipes", payload);
      toast.success(editingId ? "已更新" : "已收藏");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const rate = async (r, rating) => {
    try {
      await updateRow("recipes", r.id, { rating });
      load();
      if (detail?.id === r.id) setDetail({ ...detail, rating });
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`删除菜谱「${r.title}」？`)) return;
    try {
      await deleteRow("recipes", r.id);
      setDetail(null);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  // 勾选菜谱 → AI 合并生成采购清单
  const toggleSelect = (id) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const genShoppingList = async () => {
    setShopBusy(true);
    try {
      const r = await api.aiShoppingList([...selected]);
      setShopContent(r.content || "");
      setShopOpen(true);
      setSelectMode(false);
      setSelected(new Set());
    } catch (e) {
      toast.error(e.message);
    } finally {
      setShopBusy(false);
    }
  };

  const copyShop = async () => {
    try {
      await navigator.clipboard.writeText(shopContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("复制失败，请手动选中复制");
    }
  };

  return (
    <Layout>
      <PageHeader
        title="菜谱收藏"
        subtitle="想做的那道菜，食材和步骤都在这里"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}
            >
              <ShoppingBasket className="h-4 w-4" /> {selectMode ? "退出选择" : "采购清单"}
            </Button>
            <Button onClick={openNew}><Plus className="h-4 w-4" /> 收藏菜谱</Button>
          </div>
        }
      />

      {loading ? (
        <Loading />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {["全部", ...TYPES].map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  filter === t ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {t}
                {t !== "全部" ? ` ${rows.filter((r) => r.type === t).length}` : ` ${rows.length}`}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={ChefHat} text="还没有菜谱，收藏第一道想做的菜吧" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {filtered.map((r) => {
                const picked = selected.has(r.id);
                return (
                  <div
                    key={r.id}
                    className={`relative cursor-pointer rounded-xl border bg-white/80 p-4 transition-all hover:shadow-soft ${
                      picked ? "border-terracotta-400 ring-2 ring-terracotta-200" : "border-slate-200/70"}
                      ${selectMode ? "pl-10" : ""}`}
                    onClick={() => (selectMode ? toggleSelect(r.id) : setDetail(r))}
                  >
                    {selectMode ? (
                      <span
                        className={`absolute left-3 top-4 flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                          picked ? "border-terracotta bg-terracotta text-white" : "border-slate-300 bg-white"
                        }`}
                      >
                        {picked ? <Check className="h-3 w-3" /> : null}
                      </span>
                    ) : null}
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <h3 className="min-w-0 flex-1 truncate font-medium text-slate-900">{r.title}</h3>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{r.type}</span>
                    </div>
                    <div className="mb-2 flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={`h-3 w-3 ${r.rating >= n ? "fill-amber-400 text-amber-400" : "text-slate-200"}`}
                        />
                      ))}
                    </div>
                    {r.tags ? (
                      <p className="mb-1 flex flex-wrap gap-1">
                        {String(r.tags).split(/[,，\s]+/).filter(Boolean).slice(0, 4).map((t) => (
                          <span key={t} className={`rounded px-1.5 py-0.5 text-[10px] ${tagChip(t)}`}>#{t}</span>
                        ))}
                      </p>
                    ) : null}
                    <p className="line-clamp-2 text-xs text-slate-400">{r.ingredients}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 采购清单结果 */}
      <Modal open={shopOpen} onClose={() => setShopOpen(false)} title="采购清单">
        {shopBusy ? (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> 正在合并食材、去重分组…
          </div>
        ) : (
          <div className="space-y-3">
            <div className="max-h-[50vh] overflow-y-auto rounded-lg bg-slate-50 p-4">
              <MarkdownLite text={shopContent} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={copyShop}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "已复制" : "复制清单"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 选择模式底部浮条 */}
      {selectMode ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-slate-200 bg-white/95 py-2 pl-5 pr-2 shadow-lg backdrop-blur">
            <span className="text-sm text-slate-600">已选 <b className="text-terracotta-600">{selected.size}</b> 道菜</span>
            <Button size="sm" onClick={genShoppingList} loading={shopBusy} disabled={selected.size === 0}>
              <Sparkles className="h-3.5 w-3.5" />
              生成采购清单
            </Button>
          </div>
        </div>
      ) : null}

      {/* 菜谱详情 */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? detail.title : ""}>
        {detail ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">{detail.type}</span>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => rate(detail, detail.rating === n ? 0 : n)}>
                    <Star className={`h-4 w-4 ${detail.rating >= n ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />
                  </button>
                ))}
              </div>
              <span className="flex-1" />
              <Button variant="ghost" size="sm" onClick={() => openEdit(detail)}><Pencil className="h-3.5 w-3.5" /> 编辑</Button>
              <Button variant="danger" size="sm" onClick={() => remove(detail)}><Trash2 className="h-3.5 w-3.5" /> 删除</Button>
            </div>
            <div>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <ChefHat className="h-4 w-4 text-terracotta" /> 食材
              </h3>
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                {detail.ingredients || "还没写食材"}
              </p>
            </div>
            <div>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <Clock3 className="h-4 w-4 text-terracotta" /> 做法
              </h3>
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                {detail.steps || "还没写步骤"}
              </p>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? "编辑菜谱" : "收藏菜谱"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>菜名</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="如：番茄牛腩" />
            </div>
            <div>
              <Label>类型</Label>
              <div className="flex flex-wrap gap-1">
                {TYPES.map((t) => (
                  <button key={t} onClick={() => setForm({ ...form, type: t })}
                    className={`rounded-full px-2.5 py-1 text-xs ${form.type === t ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <Label>食材（一行一个）</Label>
            <Textarea value={form.ingredients} onChange={(e) => setForm({ ...form, ingredients: e.target.value })} rows={4} placeholder={"牛腩 500g\n番茄 3 个\n洋葱 半个"} />
          </div>
          <div>
            <Label>做法（一行一步）</Label>
            <Textarea value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} rows={5} placeholder={"1. 牛腩焯水\n2. 番茄炒出汁\n3. 小火炖 90 分钟"} />
          </div>
          <div>
            <Label>标签（可选，空格分隔）</Label>
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="下饭 秋冬 一锅出" />
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
