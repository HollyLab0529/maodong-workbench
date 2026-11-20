// 加岗位 / 改岗位。第一行就是「粘链接」，因为实际用的时候八成是从招聘页复制的。
// 字段按「投递时会用到」排序：先公司岗位城市，再批次计划，简历和下一步放下面。
import { useEffect, useState } from "react";
import { Link2, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button, Input, Textarea, Label, Modal, toast } from "../../components/ui";
import { parseJobLink } from "../../api";
import { TIERS, TIER_TONE, STATUS_GROUPS, groupOf, parseCity, publishInfo } from "../../jobs";
import { toneChip } from "../../colors";

const CITIES = ["北京", "天津", "上海", "其他"];
const TYPES = ["大厂", "中小厂", "其他"];
const SOURCES = ["BOSS直聊", "官网", "内推", "牛客", "实习僧", "其他"];

export default function JobForm({ open, initial, editingId, cfg, resumes, today, batches, policy = {}, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");

  useEffect(() => {
    setForm(initial);
    setLinkDraft(initial?.link || "");
  }, [initial, open]);

  // children 里的 form.xxx 在本组件渲染时就会求值（Modal 关闭也拦不住），
  // 所以 form 还没初始化时整个提前返回，别让 null 溜进 JSX。
  if (!form) return null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const runParse = async () => {
    const url = linkDraft.trim();
    if (!/^https?:\/\//.test(url)) return toast.error("先粘一条 http/https 链接");
    setParsing(true);
    try {
      const r = await parseJobLink(url);
      const patch = { link: url };
      if (r.company && !form.company.trim()) patch.company = r.company;
      if (r.position && !form.position.trim()) patch.position = r.position;
      if (r.city && !form.city) patch.city = r.city;
      if (r.publish_date && !form.publish_date) patch.publish_date = r.publish_date;
      if (r.source && !form.source) patch.source = r.source;
      set(patch);
      const got = ["company", "position", "city", "publish_date"].filter((k) => patch[k]);
      if (got.length) toast.success(`抓到 ${got.length} 个字段，核对一遍再存`);
      else toast("链接能打开，但页面里没找到公司/岗位，手填一下", "error");
    } catch (e) {
      toast.error("解析失败：" + e.message);
    } finally {
      setParsing(false);
    }
  };

  const submit = async () => {
    if (!form.company.trim()) return toast.error("请填写公司名");
    // 红线名单：命中就把话说清楚，确认了才存
    const blacklist = Array.isArray(policy.blacklist) ? policy.blacklist : [];
    const hit = blacklist.find((n) => n && form.company.includes(n));
    if (hit && !window.confirm(`「${hit}」在红线名单里（不想再投的公司）。确定还要存吗？`)) return;
    const payload = {
      company: form.company.trim(),
      position: form.position.trim(),
      jd_code: form.jd_code.trim(),
      location: form.location.trim(),
      business: form.business.trim(),
      link: form.link.trim(),
      publish_date: form.publish_date || "",
      plan_date: form.plan_date || "",
      applied_date: form.applied_date || "",
      tier: form.tier || "",
      batch: form.batch.trim(),
      batch_date: form.batch_date || "",
      resume_id: form.resume_id ? Number(form.resume_id) : "",
      status: form.status,
      note: form.note.trim(),
      // 城市枚举：从 location 提取，提不出就归「其他」，别留空让筛选漏掉
      city: form.city || parseCity(form.location).city || "其他",
      city_multi: form.city_multi ? "1" : "",
      company_type: form.company_type || "",
      source: form.source || "",
      next_action: form.next_action.trim(),
      next_action_date: form.next_action_date || "",
    };
    // 表单里明确选了「已投之后」的状态，才补投递日期；不再由状态变更偷偷写
    if (payload.status && groupOf(payload.status, cfg.config) !== "todo" && !payload.applied_date) {
      payload.applied_date = today;
    }
    setSaving(true);
    try {
      await onSave(payload, editingId);
      onClose();
    } catch (e) {
      toast.error("保存失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  const pi = form.publish_date ? publishInfo({ publish_date: form.publish_date }, today) : null;

  return (
    <Modal open={open} onClose={onClose} title={editingId ? "编辑岗位" : "加岗位"} wide>
      <div className="space-y-4">
        <div>
          <Label>招聘链接（粘进来能自动认公司 / 岗位 / 城市）</Label>
          <div className="flex gap-1.5">
            <Input
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
              onBlur={() => linkDraft.trim() !== (form.link || "") && set({ link: linkDraft.trim() })}
              placeholder="https://www.zhipin.com/job_detail/…"
            />
            <Button type="button" variant="outline" onClick={runParse} disabled={parsing} className="shrink-0">
              {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              解析
            </Button>
          </div>
          {pi ? (
            <p className="mt-1 text-[11px] text-slate-400">
              岗位发布于 {form.publish_date}（{pi.days} 天前{pi.stale ? "，可能是常驻岗" : pi.fresh ? "，新岗优先投" : ""}）
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-slate-300">解析只是预填建议，认不准的字段留空，手填更稳。</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>公司</Label>
            <Input value={form.company} onChange={(e) => set({ company: e.target.value })} placeholder="公司名" />
            {(() => {
              const hit = (Array.isArray(policy.blacklist) ? policy.blacklist : []).find((n) => n && form.company.includes(n));
              return hit ? <p className="mt-1 text-[11px] text-red-500">红线名单：{hit}</p> : null;
            })()}
          </div>
          <div>
            <Label>岗位</Label>
            <Input value={form.position} onChange={(e) => set({ position: e.target.value })} placeholder="如：AI 应用产品经理" />
          </div>
          <div>
            <Label>城市</Label>
            <select
              value={form.city}
              onChange={(e) => set({ city: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-terracotta"
            >
              <option value="">未选</option>
              {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <Label>公司类型</Label>
            <select
              value={form.company_type}
              onChange={(e) => set({ company_type: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-terracotta"
            >
              <option value="">未选</option>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <Label>工作地点（原文）</Label>
            <Input value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="如：北京市朝阳区 / 北京、上海" />
          </div>
          <div>
            <Label>来源渠道</Label>
            <select
              value={form.source}
              onChange={(e) => set({ source: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-terracotta"
            >
              <option value="">未选</option>
              {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div>
          <Label>档位</Label>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => set({ tier: "" })}
              className={`rounded-full px-3 py-1 text-xs ${form.tier === "" ? "bg-slate-200 font-medium text-slate-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
            >
              未分档
            </button>
            {TIERS.map((t) => (
              <button
                key={t}
                onClick={() => set({ tier: t })}
                className={`rounded-full px-3 py-1 text-xs ${form.tier === t ? `font-medium ring-1 ring-terracotta ${toneChip(TIER_TONE[t])}` : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>批次（一包一批）</Label>
            <Input
              value={form.batch}
              onChange={(e) => set({ batch: e.target.value })}
              list="job-batch-options"
              placeholder="如：包-2026-11-20"
            />
            <datalist id="job-batch-options">
              {batches.map((b) => <option key={b} value={b} />)}
            </datalist>
          </div>
          <div>
            <Label>批次日期</Label>
            <Input type="date" value={form.batch_date} onChange={(e) => set({ batch_date: e.target.value })} />
          </div>
          <div>
            <Label>计划投递日期</Label>
            <Input type="date" value={form.plan_date} onChange={(e) => set({ plan_date: e.target.value })} />
          </div>
          <div>
            <Label>实际投递日期（没投就留空）</Label>
            <Input type="date" value={form.applied_date} onChange={(e) => set({ applied_date: e.target.value })} />
          </div>
        </div>

        <div>
          <Label>当前状态</Label>
          <div className="space-y-1.5">
            {STATUS_GROUPS.map((g) => {
              const list = cfg.config.filter((c) => c.group === g.key);
              if (!list.length) return null;
              return (
                <div key={g.key} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-14 shrink-0 text-[11px] text-slate-300">{g.label}</span>
                  {list.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => set({ status: c.name })}
                      className={`rounded-full px-3 py-1 text-xs ${form.status === c.name ? `font-medium ring-1 ring-terracotta ${cfg.styleOf(c.name)}` : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>下一步动作（可选）</Label>
            <Input value={form.next_action} onChange={(e) => set({ next_action: e.target.value })} placeholder="如：催 HR / 等二面通知" />
          </div>
          <div>
            <Label>哪天做</Label>
            <Input type="date" value={form.next_action_date} onChange={(e) => set({ next_action_date: e.target.value })} />
          </div>
        </div>

        {resumes.length ? (
          <div>
            <Label>用了哪版简历（可选）</Label>
            <select
              value={form.resume_id}
              onChange={(e) => set({ resume_id: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-terracotta"
            >
              <option value="">不关联</option>
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}{r.in_use ? "（在用）" : ""}{r.folder ? ` · ${r.folder}` : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>JD 编号（可选）</Label>
            <Input value={form.jd_code} onChange={(e) => set({ jd_code: e.target.value })} placeholder="如 20261028-01" />
          </div>
          <div>
            <Label>业务方向（可选）</Label>
            <Input value={form.business} onChange={(e) => set({ business: e.target.value })} placeholder="如：B 端 / 搜索" />
          </div>
        </div>

        <div>
          <Label>备注（可选）</Label>
          <Textarea value={form.note} onChange={(e) => set({ note: e.target.value })} rows={2} placeholder="内推人、薪资范围、面试感受…" />
        </div>

        <div className="flex items-center gap-2">
          {editingId && onDelete ? (
            <Button variant="danger" onClick={() => onDelete(editingId)} className="mr-auto">
              <Trash2 className="h-4 w-4" /> 删除
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose} className="ml-auto">取消</Button>
          <Button onClick={submit} loading={saving}>保存</Button>
        </div>
      </div>
    </Modal>
  );
}
