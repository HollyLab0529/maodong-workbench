import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/Layout";
import { listRows, insertRow, updateRow, deleteRow } from "../../api";
import { useLiveReload } from "../../live";
import { Button, Input, Textarea, Label, Modal, Badge, EmptyState, Loading, toast } from "../../components/ui";
import { Plus, Trash2, Pencil, Scale, Crown } from "lucide-react";

const EMPTY = {
  company: "", position: "", base_salary: "", months: "12", sign_on: "",
  equity: "", commute: "", team_score: 3, growth_score: 3, note: "", status: "考虑中",
};
const STATUSES = ["考虑中", "已接受", "已拒绝"];
const STATUS_STYLE = {
  考虑中: "bg-blue-50 text-blue-600",
  已接受: "bg-green-50 text-green-600",
  已拒绝: "bg-slate-100 text-slate-400",
};

function yearly(o) {
  return (Number(o.base_salary) || 0) * (Number(o.months) || 12) + (Number(o.sign_on) || 0);
}

export default function Offers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setRows(await listRows("offers"));
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  // 综合评分：年包 45% + 团队 30% + 成长 25%（均为相对最高值归一）
  const ranked = useMemo(() => {
    const maxY = Math.max(...rows.map(yearly), 1);
    const scored = rows.map((o) => ({
      ...o,
      _yearly: yearly(o),
      _score:
        0.45 * (yearly(o) / maxY) * 100 +
        0.3 * ((Number(o.team_score) || 0) / 5) * 100 +
        0.25 * ((Number(o.growth_score) || 0) / 5) * 100,
    }));
    return scored.sort((a, b) => b._score - a._score);
  }, [rows]);

  const openNew = () => { setForm(EMPTY); setEditingId(null); setOpen(true); };
  const openEdit = (o) => {
    setForm({
      company: o.company || "", position: o.position || "", base_salary: o.base_salary || "",
      months: o.months || "12", sign_on: o.sign_on || "", equity: o.equity || "",
      commute: o.commute || "", team_score: Number(o.team_score) || 3, growth_score: Number(o.growth_score) || 3,
      note: o.note || "", status: o.status || "考虑中",
    });
    setEditingId(o.id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.company.trim()) return toast.error("请填写公司");
    if (!form.base_salary) return toast.error("请填写月薪");
    setSaving(true);
    try {
      const payload = {
        company: form.company.trim(),
        position: form.position.trim(),
        base_salary: Number(form.base_salary) || 0,
        months: Number(form.months) || 12,
        sign_on: Number(form.sign_on) || 0,
        equity: form.equity.trim(),
        commute: Number(form.commute) || 0,
        team_score: form.team_score,
        growth_score: form.growth_score,
        note: form.note.trim(),
        status: form.status,
      };
      if (editingId) {
        await updateRow("offers", editingId, payload);
        toast.success("已更新");
      } else {
        await insertRow("offers", payload);
        toast.success("已添加 Offer");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error("保存失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (o) => {
    if (!window.confirm(`删除「${o.company}」的 Offer？`)) return;
    try {
      await deleteRow("offers", o.id);
      load();
    } catch (e) {
      toast.error("删除失败：" + e.message);
    }
  };

  const Stars = ({ n, color = "bg-amber-400" }) => (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`h-1.5 w-4 rounded-full ${i <= n ? color : "bg-slate-200"}`} />
      ))}
    </span>
  );

  return (
    <>
      <PageHeader
        title="Offer 对比"
        subtitle="年包、团队、成长性统一打分，别靠感觉做决定"
        action={<Button onClick={openNew}><Plus className="h-4 w-4" /> 添加 Offer</Button>}
      />

      {loading ? (
        <Loading />
      ) : ranked.length === 0 ? (
        <EmptyState icon={Scale} text="还没有 Offer，拿到一个记一个" />
      ) : (
        <div className="space-y-3">
          {ranked.map((o, idx) => (
            <div
              key={o.id}
              className={`group rounded-xl border p-4 transition-shadow hover:shadow-soft ${
                idx === 0 && o.status === "考虑中" ? "border-terracotta-300 bg-terracotta-50/40" : "border-slate-200/70 bg-white/80"
              }`}
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {idx === 0 && o.status === "考虑中" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-terracotta px-2 py-0.5 text-[11px] font-medium text-white">
                    <Crown className="h-3 w-3" /> 综合最优
                  </span>
                ) : null}
                <h3 className="font-medium text-slate-900">{o.company}</h3>
                <span className="text-xs text-slate-400">{o.position || "岗位未填"}</span>
                <Badge className={`ml-auto ${STATUS_STYLE[o.status] || ""}`}>{o.status}</Badge>
                <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => openEdit(o)} className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100">编辑</button>
                  <button onClick={() => remove(o)} className="rounded px-1.5 py-1 text-slate-300 hover:bg-red-50 hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-[11px] text-slate-400">年包（估）</p>
                  <p className="font-semibold text-slate-900">
                    ¥{(o._yearly / 10000).toFixed(1)} 万
                    <span className="ml-1 text-[11px] font-normal text-slate-400">
                      {Number(o.base_salary).toLocaleString()}×{o.months}
                      {Number(o.sign_on) ? ` +签字费${Number(o.sign_on).toLocaleString()}` : ""}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400">团队氛围</p>
                  <Stars n={Number(o.team_score) || 0} />
                </div>
                <div>
                  <p className="text-[11px] text-slate-400">成长空间</p>
                  <Stars n={Number(o.growth_score) || 0} />
                </div>
                <div>
                  <p className="text-[11px] text-slate-400">通勤</p>
                  <p className="text-slate-700">{Number(o.commute) ? `${o.commute} 分钟` : "—"}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3 border-t border-slate-100 pt-2">
                <p className="text-[11px] text-slate-400">
                  综合分 <span className="font-semibold text-terracotta-600">{o._score.toFixed(1)}</span>
                  <span className="ml-1">（年包 45% · 团队 30% · 成长 25%）</span>
                </p>
                {o.equity ? <p className="text-[11px] text-slate-500">股票/期权：{o.equity}</p> : null}
                {o.note ? <p className="truncate text-[11px] text-slate-400">{o.note}</p> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? "编辑 Offer" : "添加 Offer"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>公司</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="公司名" />
            </div>
            <div>
              <Label>岗位</Label>
              <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="岗位名" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>月薪（¥）</Label>
              <Input type="number" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} placeholder="25000" />
            </div>
            <div>
              <Label>几薪</Label>
              <Input type="number" value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })} />
            </div>
            <div>
              <Label>签字费（可选）</Label>
              <Input type="number" value={form.sign_on} onChange={(e) => setForm({ ...form, sign_on: e.target.value })} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>股票 / 期权（文字描述）</Label>
              <Input value={form.equity} onChange={(e) => setForm({ ...form, equity: e.target.value })} placeholder="如：4 年 RSU 40 万" />
            </div>
            <div>
              <Label>单程通勤（分钟）</Label>
              <Input type="number" value={form.commute} onChange={(e) => setForm({ ...form, commute: e.target.value })} placeholder="40" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>团队氛围（1-5）</Label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setForm({ ...form, team_score: n })}
                    className={`h-7 flex-1 rounded-lg text-xs ${form.team_score >= n ? "bg-amber-400 text-white" : "bg-slate-100 text-slate-400"}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>成长空间（1-5）</Label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setForm({ ...form, growth_score: n })}
                    className={`h-7 flex-1 rounded-lg text-xs ${form.growth_score >= n ? "bg-emerald-400 text-white" : "bg-slate-100 text-slate-400"}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <Label>状态</Label>
            <div className="flex gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setForm({ ...form, status: s })}
                  className={`flex-1 rounded-lg py-1.5 text-xs ${
                    form.status === s ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>备注（可选）</Label>
            <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} placeholder="面试感受、部门方向、值得注意的细节…" />
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
