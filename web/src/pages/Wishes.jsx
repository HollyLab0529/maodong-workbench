import { useEffect, useMemo, useState } from "react";
import { Gift, Plus, Trash2, Pencil, Link2, Check, Loader2 } from "lucide-react";
import { listRows, insertRow, updateRow, deleteRow, todayStr } from "../api";
import { Button, Input, Label, Modal, toast } from "../components/ui";
import { toneChip } from "../colors";
import Layout, { PageHeader } from "../components/Layout";

const TYPES = ["想买", "想去", "想做"];
const STATUSES = ["心痒", "攒钱中", "已拿下", "放弃"];
const STATUS_TONE = { 心痒: "teal", 攒钱中: "amber", 已拿下: "green", 放弃: "slate" };
const TYPE_TONE = { 想买: "blue", 想去: "rose", 想做: "violet" };
const EMPTY = { name: "", type: "想买", target: "", link: "", status: "心痒", note: "" };

const chip = "shrink-0 rounded-full px-2.5 py-1 text-xs";

// 预算是否是纯金额（如 15.12 / ¥2000）；「7 天行程」这类非金额目标不记账
const moneyOf = (target) => {
  const m = String(target || "").replace(/^\s*[¥￥]?\s*/, "").trim();
  return /^\d+(\.\d+)?$/.test(m) ? parseFloat(m) : 0;
};

// 标记「已拿下」时自动记一笔支出到记账
const recordDoneExpense = async (r) => {
  const amt = moneyOf(r.target);
  if (!amt || amt <= 0) return null;
  try {
    await insertRow("expenses", {
      amount: String(amt),
      category: "心愿达成",
      note: `心愿拿下:${r.name}${r.link ? "（" + r.link + "）" : ""}`,
      spent_at: todayStr(),
    });
    return amt;
  } catch {
    return null;
  }
};

export default function Wishes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("全部");
  const [filterStatus, setFilterStatus] = useState("全部");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setRows(await listRows("wishes"));
    } catch (e) {
      toast.error("加载失败:" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => (filterType === "全部" ? true : r.type === filterType))
        .filter((r) => (filterStatus === "全部" ? true : r.status === filterStatus))
        .sort((a, b) => (a.status === "已拿下" ? 1 : 0) - (b.status === "已拿下" ? 1 : 0) || String(b.created_at || "").localeCompare(String(a.created_at || ""))),
    [rows, filterType, filterStatus]
  );

  // 状态宫格：各状态的条数与金额小计（随类型筛选联动）
  const statusStats = useMemo(
    () =>
      STATUSES.map((s) => {
        const list = rows.filter((r) => r.status === s && (filterType === "全部" || r.type === filterType));
        const sum = list.reduce((t, r) => t + moneyOf(r.target), 0);
        return { s, n: list.length, sum };
      }),
    [rows, filterType]
  );

  const openNew = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (r) => {
    setEditing(r);
    setForm({
      name: r.name || "", type: r.type || "想买", target: r.target || "",
      link: r.link || "", status: r.status || "心痒", note: r.note || "",
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("先写上心愿名称");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), type: form.type, target: form.target.trim(),
        link: form.link.trim(), status: form.status, note: form.note.trim(),
      };
      if (editing) {
        setRows((l) => l.map((r) => (r.id === editing.id ? { ...r, ...payload } : r)));
        await updateRow("wishes", editing.id, payload);
      } else {
        const { row } = await insertRow("wishes", payload);
        setRows((l) => [row || { ...payload, id: Math.random() }, ...l]);
      }
      setModalOpen(false);
      // 变为「已拿下」时自动记一笔支出（原本就是已拿下再保存则不重复记）
      const becameDone = payload.status === "已拿下" && !(editing && editing.status === "已拿下");
      const recorded = becameDone ? await recordDoneExpense({ name: payload.name, target: payload.target, link: payload.link }) : null;
      toast.success(
        editing
          ? recorded
            ? `已更新,并自动记了笔支出 ¥${recorded} 🎉`
            : "已更新"
          : recorded
            ? `心愿已记下,并自动记了笔支出 ¥${recorded} 🎉`
            : "心愿已记下,早日拿下!"
      );
    } catch (e) {
      if (String(e.message).includes("记录不存在")) {
        toast.error("这条心愿在服务器上已不在了（可能是页面数据过期），列表已刷新，请重新打开编辑");
      } else {
        toast.error("保存失败:" + e.message);
      }
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`删除心愿「${r.name}」?`)) return;
    setRows((l) => l.filter((x) => x.id !== r.id));
    try { await deleteRow("wishes", r.id); } catch (e) { toast.error(String(e.message).includes("记录不存在") ? "这条已被删除,列表已刷新" : "删除失败:" + e.message); load(); }
  };

  const quickDone = async (r) => {
    const next = { status: "已拿下" };
    setRows((l) => l.map((x) => (x.id === r.id ? { ...x, ...next } : x)));
    try {
      await updateRow("wishes", r.id, next);
      const recorded = await recordDoneExpense(r);
      toast.success(recorded ? `恭喜,拿下了!已自动记一笔支出 ¥${recorded} 🎉` : "恭喜,拿下了!🎉");
    } catch (e) { toast.error(String(e.message).includes("记录不存在") ? "这条心愿在服务器上已不在了,列表已刷新" : "更新失败:" + e.message); load(); }
  };

  return (
    <Layout>
      <PageHeader title="心愿清单" subtitle="想买的、想去的、想做的——记下来,一个个拿下;标记「已拿下」会自动记一笔支出" />

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {["全部", ...TYPES].map((t) => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`${chip} ${filterType === t ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {t}
          </button>
        ))}
        <Button size="sm" className="ml-auto" onClick={openNew}><Plus className="h-4 w-4" /> 记个心愿</Button>
      </div>

      {/* 状态宫格:点一下只看该状态,再点一下回到全部 */}
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {statusStats.map(({ s, n, sum }) => {
          const active = filterStatus === s;
          return (
            <button key={s}
              onClick={() => setFilterStatus(active ? "全部" : s)}
              className={`rounded-xl border p-3 text-left transition ${toneChip(STATUS_TONE[s])} ${
                active ? "border-terracotta-400 ring-1 ring-terracotta" : "border-slate-200/70 hover:border-slate-300"
              }`}>
              <p className="text-xs opacity-80">{s}{active ? " · 显示中" : ""}</p>
              <p className="mt-0.5 text-lg font-semibold">{n} <span className="text-xs font-normal opacity-80">个</span></p>
              {sum > 0 ? <p className="text-[11px] opacity-80">约 ¥{sum % 1 ? sum.toFixed(2) : sum}</p> : null}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">
          <Gift className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          还没有心愿,点右上角「记个心愿」开始攒
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <div key={r.id} className={`group rounded-xl border bg-white/80 p-4 shadow-sm transition-shadow hover:shadow-md ${r.status === "已拿下" ? "border-green-200" : r.status === "放弃" ? "border-slate-200 opacity-70" : "border-slate-200/70"}`}>
              <div className="mb-2 flex items-start gap-2">
                <h3 className={`flex-1 text-sm font-semibold text-slate-900 ${r.status === "已拿下" ? "" : ""}`}>{r.name}</h3>
                <span className={`${chip} ${toneChip(TYPE_TONE[r.type] || "slate")}`}>{r.type}</span>
                <span className={`${chip} ${toneChip(STATUS_TONE[r.status] || "slate")}`}>{r.status}</span>
              </div>
              {r.target ? <p className="mb-2 text-xs text-slate-500">🎯 {r.target}{r.status !== "已拿下" && moneyOf(r.target) > 0 ? <span className="text-slate-400">（拿下后自动记入记账）</span> : null}</p> : null}
              {r.note ? <p className="mb-2 whitespace-pre-line text-xs text-slate-500">{r.note}</p> : null}
              <div className="mt-3 flex items-center gap-1.5">
                {r.link ? (
                  <a href={r.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-terracotta-600 hover:underline">
                    <Link2 className="h-3 w-3" /> 链接
                  </a>
                ) : null}
                <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {r.status !== "已拿下" && r.status !== "放弃" ? (
                    <button onClick={() => quickDone(r)} title="标记已拿下" className="rounded p-1.5 text-slate-400 hover:bg-green-50 hover:text-green-600"><Check className="h-4 w-4" /></button>
                  ) : null}
                  <button onClick={() => openEdit(r)} title="编辑" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-terracotta-600"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => remove(r)} title="删除" className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "编辑心愿" : "记个心愿"}>
        <div className="space-y-3">
          <div>
            <Label>心愿名称 *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如:降噪耳机 / 去冰岛看极光 / 学会冲咖啡" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>类型</Label>
              <div className="flex flex-wrap gap-1.5">
                {TYPES.map((t) => (
                  <button key={t} onClick={() => setForm({ ...form, type: t })}
                    className={`${chip} ${form.type === t ? "font-medium ring-1 ring-terracotta " + toneChip(TYPE_TONE[t]) : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <Label>状态</Label>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => (
                  <button key={s} onClick={() => setForm({ ...form, status: s })}
                    className={`${chip} ${form.status === s ? "font-medium ring-1 ring-terracotta " + toneChip(STATUS_TONE[s]) : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{s}</button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <Label>预算 / 目标(可选)</Label>
            <Input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="如:¥2000 / 7 天行程 / 熟练拉花" />
          </div>
          <div>
            <Label>链接(可选)</Label>
            <Input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="商品页 / 攻略 / 教程链接" />
          </div>
          <div>
            <Label>备注(可选)</Label>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="为什么要、攒钱计划、对比型号…" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>取消</Button>
            <Button onClick={save} loading={saving}>{editing ? "保存" : "记下"}</Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
