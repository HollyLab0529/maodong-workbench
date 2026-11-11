import { useEffect, useState } from "react";
import { PageHeader } from "../../components/Layout";
import { listRows, insertRow, updateRow, deleteRow } from "../../api";
import { useLiveReload } from "../../live";
import { Button, Input, Textarea, Label, Modal, EmptyState, Loading, toast } from "../../components/ui";
import { Plus, Trash2, Loader2, Pencil, History, Building2, Link2, FileText, MapPin } from "lucide-react";
import { JOB_STATUSES, jobStatusStyle, useJobStatuses } from "../../colors";

export const STATUSES = JOB_STATUSES;
export const STATUS_STYLE = Object.fromEntries(JOB_STATUSES.map((s) => [s, jobStatusStyle(s)]));
const EMPTY = { company: "", position: "", jd_code: "", location: "", business: "", link: "", applied_date: "", resume_id: "", status: "待投递", note: "" };

export default function Board() {
  const { statuses, styleOf } = useJobStatuses();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [events, setEvents] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [ev, setEv] = useState({ title: "", event_date: "", note: "" });

  const load = async () => {
    try {
      const [rows, rs] = await Promise.all([listRows("job_apps"), listRows("resumes").catch(() => [])]);
      setApps(rows);
      setResumes(rs);
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  const resumeName = (a) => resumes.find((r) => r.id === Number(a.resume_id))?.name || "";

  const openNew = () => { setForm({ ...EMPTY, resume_id: resumes.find((r) => r.in_use) ? String(resumes.find((r) => r.in_use).id) : "" }); setEditingId(null); setFormOpen(true); };
  const openEdit = (a) => {
    setForm({
      company: a.company || "", position: a.position || "", jd_code: a.jd_code || "",
      location: a.location || "", business: a.business || "", link: a.link || "",
      applied_date: a.applied_date || "", resume_id: a.resume_id ? String(a.resume_id) : "",
      status: a.status || "待投递", note: a.note || "",
    });
    setEditingId(a.id);
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.company.trim()) return toast.error("请填写公司名");
    setSaving(true);
    try {
      const payload = {
        company: form.company.trim(),
        position: form.position.trim(),
        jd_code: form.jd_code.trim(),
        location: form.location.trim(),
        business: form.business.trim(),
        link: form.link.trim(),
        applied_date: form.applied_date,
        resume_id: form.resume_id || "",
        status: form.status,
        note: form.note.trim(),
        updated_at: new Date().toISOString(),
      };
      if (editingId) {
        await updateRow("job_apps", editingId, payload);
        toast.success("已更新");
      } else {
        await insertRow("job_apps", payload);
        toast.success("已添加");
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
    if (!window.confirm(`确定删除「${a.company}」的记录？`)) return;
    try {
      await deleteRow("job_apps", a.id);
      toast.success("已删除");
      setDetail(null);
      load();
    } catch (e) {
      toast.error("删除失败：" + e.message);
    }
  };

  const openDetail = async (a) => {
    setDetail(a);
    setEv({ title: "", event_date: "", note: "" });
    try {
      const all = await listRows("job_events");
      setEvents(all.filter((e) => Number(e.app_id) === a.id).reverse());
    } catch {
      setEvents([]);
    }
  };

  const addEvent = async () => {
    if (!ev.title.trim()) return toast.error("请填写进展内容");
    try {
      await insertRow("job_events", {
        app_id: detail.id,
        title: ev.title.trim(),
        event_date: ev.event_date || "",
        note: ev.note.trim(),
      });
      toast.success("已记录进展");
      openDetail(detail);
    } catch (e) {
      toast.error("保存失败：" + e.message);
    }
  };

  const changeStatus = async (a, status) => {
    try {
      await updateRow("job_apps", a.id, { status, updated_at: new Date().toISOString() });
      load();
      if (detail && detail.id === a.id) setDetail({ ...detail, status });
    } catch (e) {
      toast.error("更新失败：" + e.message);
    }
  };

  return (
    <>
      <PageHeader
        title="求职看板"
        subtitle="追踪每家公司的流程与时间线"
        action={<Button onClick={openNew}><Plus className="h-4 w-4" /> 添加公司</Button>}
      />

      {loading ? (
        <Loading />
      ) : apps.length === 0 ? (
        <EmptyState icon={Building2} text="还没有求职记录，添加第一家吧" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {apps.map((a) => (
            <div
              key={a.id}
              className="cursor-pointer rounded-xl border border-slate-200/70 bg-white/80 p-4 transition-shadow hover:shadow-soft"
              onClick={() => openDetail(a)}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-medium text-slate-900">{a.company}</h3>
                  <p className="truncate text-xs text-slate-400">
                    {a.position || "岗位未填"}
                    {a.jd_code ? ` · JD ${a.jd_code}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${styleOf(a.status)}`}>
                  {a.status}
                </span>
              </div>
              {a.business || a.location || a.applied_date ? (
                <p className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                  {a.location ? <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{a.location}</span> : null}
                  {a.business ? <span>{a.business}</span> : null}
                  {a.applied_date ? <span className="text-slate-400">投递 {String(a.applied_date).slice(5)}</span> : null}
                </p>
              ) : null}
              {(resumeName(a) || a.link) ? (
                <p className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                  {resumeName(a) ? <span className="inline-flex items-center gap-0.5"><FileText className="h-3 w-3" />用「{resumeName(a)}」版本</span> : null}
                  {a.link ? (
                    <a
                      href={a.link}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-0.5 text-terracotta-600 hover:underline"
                    >
                      <Link2 className="h-3 w-3" /> 投递链接
                    </a>
                  ) : null}
                </p>
              ) : null}
              {a.note ? <p className="mb-2 line-clamp-2 text-xs text-slate-500">{a.note}</p> : null}
              <div className="flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {statuses.map((s) => (
                  <button
                    key={s}
                    onClick={() => changeStatus(a, s)}
                    title={a.status === s ? "当前状态" : `改为「${s}」`}
                    className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                      a.status === s
                        ? "font-medium " + styleOf(s)
                        : "text-slate-400 hover:bg-slate-100"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editingId ? "编辑记录" : "添加公司"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>公司</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="公司名" />
            </div>
            <div>
              <Label>岗位</Label>
              <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="如：AI 产品经理" />
            </div>
            <div>
              <Label>JD 编号（可选）</Label>
              <Input value={form.jd_code} onChange={(e) => setForm({ ...form, jd_code: e.target.value })} placeholder="如 20261028-01" />
            </div>
            <div>
              <Label>工作地点（可选）</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="如：北京市" />
            </div>
            <div>
              <Label>业务方向（可选）</Label>
              <Input value={form.business} onChange={(e) => setForm({ ...form, business: e.target.value })} placeholder="如：B 端 / 搜索 / 大数据" />
            </div>
            <div>
              <Label>投递日期（可选）</Label>
              <Input type="date" value={form.applied_date} onChange={(e) => setForm({ ...form, applied_date: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>投递链接（可选）</Label>
            <Input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://…" />
          </div>
          {resumes.length ? (
            <div>
              <Label>使用简历版本（可选）</Label>
              <select
                value={form.resume_id}
                onChange={(e) => setForm({ ...form, resume_id: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-terracotta"
              >
                <option value="">不关联</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}{r.in_use ? "（在用）" : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <Label>当前状态</Label>
            <div className="flex flex-wrap gap-1.5">
              {statuses.map((s) => (
                <button
                  key={s}
                  onClick={() => setForm({ ...form, status: s })}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    form.status === s
                      ? "font-medium ring-1 ring-terracotta " + styleOf(s)
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>备注（可选）</Label>
            <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="渠道、内推人、薪资范围…" rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
            <Button onClick={save} loading={saving}>保存</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.company} · ${detail.status}` : ""}>
        {detail ? (
          <>
            <div className="mb-4 flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => openEdit(detail)}><Pencil className="h-3.5 w-3.5" /> 编辑</Button>
              <Button variant="danger" size="sm" onClick={() => remove(detail)}><Trash2 className="h-3.5 w-3.5" /> 删除</Button>
            </div>
            {(detail.jd_code || detail.location || detail.business || detail.applied_date || detail.link || resumeName(detail)) ? (
              <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-slate-50 p-3 text-xs">
                {detail.jd_code ? <p><span className="text-slate-400">JD 编号：</span><span className="text-slate-700">{detail.jd_code}</span></p> : null}
                {detail.location ? <p><span className="text-slate-400">地点：</span><span className="text-slate-700">{detail.location}</span></p> : null}
                {detail.business ? <p><span className="text-slate-400">业务：</span><span className="text-slate-700">{detail.business}</span></p> : null}
                {detail.applied_date ? <p><span className="text-slate-400">投递日期：</span><span className="text-slate-700">{detail.applied_date}</span></p> : null}
                {resumeName(detail) ? <p><span className="text-slate-400">简历版本：</span><span className="text-slate-700">{resumeName(detail)}</span></p> : null}
                {detail.link ? (
                  <p className="col-span-2 truncate">
                    <span className="text-slate-400">链接：</span>
                    <a href={detail.link} target="_blank" rel="noreferrer" className="text-terracotta-600 hover:underline">{detail.link}</a>
                  </p>
                ) : null}
              </div>
            ) : null}
            {detail.note ? <p className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{detail.note}</p> : null}

            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <History className="h-4 w-4 text-slate-400" /> 进展时间线
            </h3>
            {events.length === 0 ? (
              <p className="pb-2 text-xs text-slate-400">还没有进展记录</p>
            ) : (
              <div className="mb-4">
                {events.map((item, i) => (
                  <div key={item.id} className="relative flex gap-3 pb-4">
                    {i < events.length - 1 ? <div className="absolute left-[5px] top-4 h-full w-px bg-slate-200" /> : null}
                    <div className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-terracotta" />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800">{item.title}</p>
                      <p className="text-[11px] text-slate-400">
                        {item.event_date || ""}
                        {item.event_date && item.note ? " · " : ""}
                        {item.note}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2 rounded-lg border border-slate-100 bg-white/60 p-3">
              <Input value={ev.title} onChange={(e) => setEv({ ...ev, title: e.target.value })} placeholder="新进展，如：一面通过" />
              <div className="flex gap-2">
                <Input type="date" className="w-40" value={ev.event_date} onChange={(e) => setEv({ ...ev, event_date: e.target.value })} />
                <Input value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} placeholder="补充说明（可选）" />
              </div>
              <Button size="sm" onClick={addEvent} className="w-full">
                <Plus className="h-3.5 w-3.5" /> 记录这条进展
              </Button>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
