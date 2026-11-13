import { useEffect, useMemo, useState } from "react";
import Layout, { PageHeader } from "../components/Layout";
import { listRows, insertRow, updateRow, deleteRow, todayStr, api } from "../api";
import { useLiveReload } from "../live";
import { Button, Input, Label, Modal, EmptyState, Loading, toast } from "../components/ui";
import { Plus, Trash2, Wallet, TrendingUp, PiggyBank, Sparkles } from "lucide-react";

const CATEGORIES = ["餐饮", "交通", "购物", "居住", "娱乐", "学习", "医疗", "人情", "其他", "心愿达成"];
const CAT_COLORS = {
  餐饮: "bg-orange-400",
  交通: "bg-blue-400",
  购物: "bg-pink-400",
  居住: "bg-emerald-400",
  娱乐: "bg-purple-400",
  心愿达成: "bg-green-500",
  学习: "bg-indigo-400",
  医疗: "bg-red-400",
  人情: "bg-amber-400",
  其他: "bg-slate-300",
};

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function lastMonths(n) {
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const t = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(monthKey(t));
  }
  return out;
}

export default function Expenses() {
  const [rows, setRows] = useState([]);
  const [budget, setBudget] = useState("");
  const [budgetDraft, setBudgetDraft] = useState("");
  const [budgetId, setBudgetId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("餐饮");
  const [spentAt, setSpentAt] = useState(todayStr());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const today = todayStr();

  const load = async () => {
    try {
      setRows(await listRows("expenses"));
      const settings = await listRows("settings").catch(() => []);
      const b = settings.find((s) => s.key === "monthly_budget");
      if (b) {
        setBudgetId(b.id);
        setBudget(b.value || "");
        setBudgetDraft(b.value || "");
      }
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  const month = today.slice(0, 7);
  const monthRows = rows.filter((r) => (r.spent_at || "").startsWith(month));
  const monthTotal = monthRows.reduce((s, r) => s + Number(r.amount || 0), 0);

  const byCat = useMemo(() => {
    const map = {};
    monthRows.forEach((r) => {
      map[r.category] = (map[r.category] || 0) + Number(r.amount || 0);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [monthRows]);

  // 近 6 个月趋势
  const trend = useMemo(() => {
    const keys = lastMonths(6);
    const map = {};
    rows.forEach((r) => {
      const k = (r.spent_at || "").slice(0, 7);
      if (k) map[k] = (map[k] || 0) + Number(r.amount || 0);
    });
    const items = keys.map((k) => ({ key: k, total: map[k] || 0 }));
    const max = Math.max(...items.map((i) => i.total), 1);
    return { items, max };
  }, [rows]);

  const budgetNum = Number(budget) || 0;
  const budgetPct = budgetNum > 0 ? Math.min(100, (monthTotal / budgetNum) * 100) : 0;

  const grouped = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      const d = (r.spent_at || "").slice(0, 10);
      (map[d] = map[d] || []).push(r);
    });
    return Object.entries(map).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [rows]);

  const saveBudget = async () => {
    const v = budgetDraft.trim();
    if (v && (!Number(v) || Number(v) <= 0)) return toast.error("预算需为正数");
    try {
      if (budgetId) {
        await updateRow("settings", budgetId, { value: v });
      } else if (v) {
        const saved = await insertRow("settings", { key: "monthly_budget", value: v });
        setBudgetId(saved.id);
      }
      setBudget(v);
      toast.success(v ? "预算已保存" : "预算已清除");
    } catch (e) {
      toast.error("保存失败：" + e.message);
    }
  };

  const save = async () => {
    const n = Number(amount);
    if (!n || n <= 0) return toast.error("请输入有效金额");
    setSaving(true);
    try {
      await insertRow("expenses", { amount: n, category, spent_at: spentAt || today, note: note.trim() });
      toast.success("已记一笔");
      setOpen(false);
      setAmount("");
      setNote("");
      load();
    } catch (e) {
      toast.error("保存失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r) => {
    try {
      await deleteRow("expenses", r.id);
      load();
    } catch (e) {
      toast.error("删除失败：" + e.message);
    }
  };

  // 一句话记账：单笔 → AI 预填弹窗确认；多件（购物清单）→ 拆成逐笔直接记入
  const quickAdd = async () => {
    const t = aiText.trim();
    if (!t) return;
    setAiBusy(true);
    try {
      const r = await api.aiParse(t);
      if (r.action !== "expense") {
        toast.error("没识别出支出信息，试试“昨天打车 23 块”这样的说法");
        return;
      }
      // 多件商品：逐条记入（name 做备注，分类/日期可各不相同）
      const items = (Array.isArray(r.items) ? r.items : [])
        .map((it) => ({
          amount: Number(it.amount),
          category: CATEGORIES.includes(it.category) ? it.category : "购物",
          note: it.name || "AI 拆分",
          spent_at: /^\d{4}-\d{2}-\d{2}$/.test(it.spent_at || "") ? it.spent_at : today,
        }))
        .filter((it) => it.amount > 0);
      if (items.length > 1) {
        for (const it of items) await insertRow("expenses", it);
        const total = items.reduce((s, it) => s + it.amount, 0);
        toast.success(`已拆成 ${items.length} 笔记入，合计 ¥${total.toFixed(2)}`);
        setAiText("");
        load();
        return;
      }
      // 单笔（含 items 只有一件的情形）：走弹窗确认
      const single = items[0];
      const amount = single ? single.amount : Number(r.amount);
      if (!(amount > 0)) {
        toast.error("没识别出支出信息，试试“昨天打车 23 块”这样的说法");
        return;
      }
      setAmount(String(amount));
      setCategory(single ? single.category : CATEGORIES.includes(r.category) ? r.category : "餐饮");
      setSpentAt(single ? single.spent_at : r.spent_at || today);
      setNote(single ? single.note : r.note || t);
      setOpen(true);
      setAiText("");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="记账"
        subtitle="轻量记账：月度汇总、分类占比、半年趋势与预算"
        action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> 记一笔</Button>}
      />

      {loading ? (
        <Loading />
      ) : (
        <>
          {/* 一句话记账 */}
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-terracotta-100 bg-terracotta-50/50 p-3">
            <Sparkles className="h-4 w-4 shrink-0 text-terracotta" />
            <input
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && quickAdd()}
              placeholder="一句话记账：如「昨天晚饭花了 38」「地铁通勤 4 块」"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
            <Button size="sm" onClick={quickAdd} loading={aiBusy}>
              解析
            </Button>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200/70 bg-white/80 p-5">
              <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
                <Wallet className="h-4 w-4" /> 本月支出（{month}）
              </div>
              <p className="text-3xl font-semibold text-slate-900">¥{monthTotal.toFixed(2)}</p>

              {/* 月预算 */}
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <PiggyBank className="h-3.5 w-3.5" /> 月预算
                  </span>
                  <span className={budgetNum > 0 && monthTotal > budgetNum ? "font-medium text-red-500" : "text-slate-500"}>
                    {budgetNum > 0 ? `¥${monthTotal.toFixed(0)} / ¥${budgetNum.toFixed(0)}` : "未设置"}
                  </span>
                </div>
                {budgetNum > 0 ? (
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`transition-progress h-full rounded-full ${monthTotal > budgetNum ? "bg-red-400" : "bg-terracotta"}`}
                      style={{ width: `${budgetPct}%` }}
                    />
                  </div>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    value={budgetDraft}
                    onChange={(e) => setBudgetDraft(e.target.value)}
                    placeholder="设置每月预算"
                    className="h-8 py-1 text-xs"
                  />
                  <Button variant="subtle" size="sm" onClick={saveBudget}>保存</Button>
                </div>
              </div>
            </div>

            {/* 半年趋势 */}
            <div className="rounded-xl border border-slate-200/70 bg-white/80 p-5">
              <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
                <TrendingUp className="h-4 w-4" /> 近 6 个月支出趋势
              </div>
              <div className="flex h-32 items-end gap-3">
                {trend.items.map(({ key, total }) => {
                  const h = Math.max(4, (total / trend.max) * 100);
                  const isCurrent = key === month;
                  return (
                    <div key={key} className="flex flex-1 flex-col items-center gap-1.5">
                      <span className="text-[10px] text-slate-400">{total > 0 ? `¥${total.toFixed(0)}` : ""}</span>
                      <div className="flex w-full flex-1 items-end">
                        <div
                          className={`w-full rounded-t-md ${isCurrent ? "bg-terracotta" : "bg-terracotta-200"}`}
                          style={{ height: `${h}%` }}
                          title={`${key}：¥${total.toFixed(2)}`}
                        />
                      </div>
                      <span className={`text-[10px] ${isCurrent ? "font-medium text-terracotta-600" : "text-slate-400"}`}>
                        {key.slice(5)}月
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {byCat.length > 0 ? (
            <div className="mb-6 rounded-xl border border-slate-200/70 bg-white/80 p-5">
              <h2 className="mb-3 text-xs font-semibold text-slate-400">本月分类占比</h2>
              <div className="space-y-2">
                {byCat.map(([c, v]) => (
                  <div key={c} className="flex items-center gap-2">
                    <span className="w-10 shrink-0 text-xs text-slate-500">{c}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${CAT_COLORS[c] || "bg-slate-300"}`}
                        style={{ width: `${monthTotal ? (v / monthTotal) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs text-slate-500">¥{v.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {rows.length === 0 ? (
            <EmptyState icon={Wallet} text="还没有账目，记下第一笔吧" />
          ) : (
            <div className="space-y-5">
              {grouped.map(([date, items]) => (
                <div key={date}>
                  <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-400">
                    {date}
                    <span className="font-normal">
                      共 ¥{items.reduce((s, r) => s + Number(r.amount || 0), 0).toFixed(2)}
                    </span>
                  </h2>
                  <div className="space-y-1.5">
                    {items.map((r) => (
                      <div key={r.id} className="group flex items-center gap-3 rounded-lg border border-slate-100 bg-white/80 px-3.5 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] text-white ${CAT_COLORS[r.category] || "bg-slate-300"}`}>
                          {r.category}
                        </span>
                        <span className="flex-1 truncate text-sm text-slate-600">{r.note || "—"}</span>
                        <span className="text-sm font-medium text-slate-900">¥{Number(r.amount).toFixed(2)}</span>
                        <button onClick={() => remove(r)} className="text-slate-200 transition-colors hover:text-red-400 group-hover:text-slate-300">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="记一笔">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>金额（¥）</Label>
              <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>日期</Label>
              <Input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>分类</Label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-3 py-1 text-xs ${
                    category === c ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>备注（可选）</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="买了什么？" onKeyDown={(e) => e.key === "Enter" && save()} />
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
