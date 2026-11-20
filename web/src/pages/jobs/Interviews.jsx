// 面试复盘：每轮被问了什么、答得如何。
// 公司选择改成可搜索（选项带岗位，快手有 14 个岗位时不再是 14 个同名「快手」）；
// 不记题目也能存草稿；结果选「通过」时顺手把看板状态推进一档。
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/Layout";
import { listRows, insertRow, updateRow, deleteRow, fmtTime, api } from "../../api";
import { useLiveReload } from "../../live";
import { Button, Input, Textarea, Label, Modal, Badge, EmptyState, Loading, toast } from "../../components/ui";
import { Plus, Trash2, Pencil, MessagesSquare, Star, Sparkles, Search } from "lucide-react";
import { STATUS_GROUPS, groupOf } from "../../jobs";
import { useJobStatuses } from "../../colors";

const ROUNDS = ["笔试", "一面", "二面", "三面", "HR面", "交叉面", "其他"];
const RESULTS = ["待定", "通过", "未通过"];
const RESULT_STYLE = {
  待定: "bg-slate-100 text-slate-500",
  通过: "bg-green-50 text-green-600",
  未通过: "bg-red-50 text-red-500",
};
const EMPTY_FORM = {
  app_id: "", round: "一面", interview_date: "", interviewers: "",
  questions: [], rating: 3, result: "待定", summary: "",
};

export default function Interviews() {
  const cfg = useJobStatuses();
  const [rows, setRows] = useState([]);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  // 可搜索的公司下拉
  const [appQuery, setAppQuery] = useState("");
  const [appDropOpen, setAppDropOpen] = useState(false);
  // 结果=通过时，选要不要推进看板状态
  const [syncAsk, setSyncAsk] = useState(null); // { interviewId, appId, company, status }

  // 列表筛选
  const [fCompany, setFCompany] = useState("");
  const [fRound, setFRound] = useState("");
  const [fResult, setFResult] = useState("");

  const load = async ({ silent = false } = {}) => {
    try {
      const [iv, a] = await Promise.all([listRows("interviews"), listRows("job_apps")]);
      setRows(iv);
      setApps(a);
    } catch (e) {
      if (!silent) toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(() => load({ silent: true }));

  const appOf = (r) => apps.find((a) => a.id === Number(r.app_id));
  const companyOf = (r) => r.company || appOf(r)?.company || "未关联公司";
  const positionOf = (r) => appOf(r)?.position || "";
  // 只列还在流程里的：结束（Offer 之外的已取消等）不该再记面试
  const openApps = useMemo(
    () => apps.filter((a) => groupOf(a.status, cfg.config) !== "closed"),
    [apps, cfg.config]
  );
  const appLabel = (a) => `${a.company} · ${a.position || "岗位未填"}`;
  const appMatches = useMemo(() => {
    const kw = appQuery.trim().toLowerCase();
    if (!kw) return openApps;
    return openApps.filter((a) => appLabel(a).toLowerCase().includes(kw));
  }, [openApps, appQuery]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => String(b.interview_date || "").localeCompare(String(a.interview_date || ""))),
    [rows]
  );
  const companies = useMemo(() => [...new Set(rows.map(companyOf))].sort((a, b) => a.localeCompare(b, "zh-CN")), [rows]);

  const filtered = useMemo(
    () => sorted.filter((r) => {
      if (fCompany && companyOf(r) !== fCompany) return false;
      if (fRound && (r.round || "") !== fRound) return false;
      if (fResult && (r.result || "") !== fResult) return false;
      return true;
    }),
    [sorted, fCompany, fRound, fResult] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const selectedApp = apps.find((a) => a.id === Number(form.app_id));

  const openNew = () => {
    setForm({ ...EMPTY_FORM, app_id: openApps[0]?.id ? String(openApps[0].id) : "", questions: [] });
    setAppQuery(openApps[0] ? appLabel(openApps[0]) : "");
    setEditingId(null);
    setOpen(true);
  };
  const openEdit = (r) => {
    let qs = [];
    try { qs = JSON.parse(r.questions || "[]"); } catch { qs = []; }
    const app = appOf(r);
    setForm({
      app_id: r.app_id ? String(r.app_id) : "", round: r.round || "一面",
      interview_date: r.interview_date || "", interviewers: r.interviewers || "",
      questions: qs, rating: Number(r.rating) || 3, result: r.result || "待定", summary: r.summary || "",
    });
    setAppQuery(app ? appLabel(app) : r.company || "");
    setEditingId(r.id);
    setOpen(true);
  };

  const setQ = (i, key, val) => {
    setForm((f) => {
      const questions = f.questions.map((q, j) => (j === i ? { ...q, [key]: val } : q));
      return { ...f, questions };
    });
  };
  const addQ = () => setForm((f) => ({ ...f, questions: [...f.questions, { q: "", my_answer: "", better_answer: "", tag: "" }] }));
  const delQ = (i) => setForm((f) => ({ ...f, questions: f.questions.filter((_, j) => j !== i) }));

  // 结果=通过 → 保存后问一句「要不要把看板状态推进」，确认才动看板
  const save = async () => {
    if (!form.app_id) {
      if (apps.length === 0) return toast.error("请先在「看板」添加公司，再记录面试");
      return toast.error("请选择公司");
    }
    const qs = form.questions.filter((q) => q.q.trim());
    setSaving(true);
    try {
      const app = apps.find((a) => a.id === Number(form.app_id));
      const payload = {
        app_id: Number(form.app_id) || null,
        company: app?.company || "",
        round: form.round,
        interview_date: form.interview_date,
        interviewers: form.interviewers.trim(),
        questions: JSON.stringify(qs),
        rating: form.rating,
        result: form.result,
        summary: form.summary.trim(),
      };
      let saved;
      if (editingId) {
        saved = await updateRow("interviews", editingId, payload);
        toast.success("已更新复盘");
      } else {
        saved = await insertRow("interviews", payload);
        toast.success(qs.length ? "已保存面试复盘" : "已存为草稿，题目之后可以补");
      }
      setOpen(false);
      if (form.result === "通过" && app) {
        setSyncAsk({ interviewId: saved.id, appId: app.id, company: app.company, status: app.status });
      }
      load({ silent: true });
    } catch (e) {
      toast.error("保存失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  // 推进看板状态 + 给这条面试打上 status_sync 标记（说明它已经同步过，别重复推）
  const applySync = async (status) => {
    const ask = syncAsk;
    setSyncAsk(null);
    if (!ask || !status) return;
    try {
      await updateRow("job_apps", ask.appId, { status });
      await updateRow("interviews", ask.interviewId, { status_sync: "1" });
      toast.success(`「${ask.company}」看板状态已推进到「${status}」`);
      load({ silent: true });
    } catch (e) {
      toast.error("状态同步失败：" + e.message);
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`删除「${companyOf(r)} ${r.round}」的复盘？`)) return;
    try {
      await deleteRow("interviews", r.id);
      setViewing(null);
      load({ silent: true });
    } catch (e) {
      toast.error("删除失败：" + e.message);
    }
  };

  // AI 归纳：粘贴面试记录 → 提取问题/考点/亮点/短板 → 一键填入问题清单
  const aiRun = async () => {
    if (aiText.trim().length < 50) return toast.error("记录太短（至少 50 字），贴面试转写或复盘笔记");
    setAiBusy(true);
    setAiResult(null);
    try {
      const app = apps.find((a) => a.id === Number(form.app_id));
      const r = await api.aiInterviewReview(aiText, app?.company || "", form.round);
      if (!r.questions?.length) return toast.error("没提取到问题，试试更完整的记录");
      setAiResult(r);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAiBusy(false);
    }
  };

  const aiApply = () => {
    if (!aiResult?.questions?.length) return;
    const qs = aiResult.questions.map((q) => ({
      q: q.q || "",
      tag: q.topic || "",
      my_answer: q.good || "",
      better_answer: q.bad || "",
    }));
    setForm((f) => ({ ...f, questions: qs }));
    setAiOpen(false);
    setAiText("");
    setAiResult(null);
    toast.success(`已填入 ${qs.length} 道题，检查后保存即可`);
  };

  const parseQs = (r) => {
    try { return JSON.parse(r.questions || "[]"); } catch { return []; }
  };

  // 推进候选：当前状态在主线里的下一档（跳过结束组），没有就空着
  const syncCandidates = useMemo(() => {
    if (!syncAsk) return [];
    const idx = cfg.statuses.indexOf(syncAsk.status);
    return cfg.config.filter((c) => {
      const g = c.group || groupOf(c.name, cfg.config);
      if (g === "closed" || g === "todo") return false;
      return idx === -1 || cfg.statuses.indexOf(c.name) > idx;
    }).map((c) => c.name);
  }, [syncAsk, cfg]);

  const selectCls =
    "rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600 outline-none focus:border-terracotta";

  return (
    <>
      <PageHeader
        title="面试复盘"
        subtitle="记录每轮被问了什么、答得如何，面试季结束就是你的题库资产"
        action={<Button onClick={openNew}><Plus className="h-4 w-4" /> 记录面试</Button>}
      />

      {loading ? (
        <Loading />
      ) : sorted.length === 0 ? (
        <EmptyState icon={MessagesSquare} text="还没有面试复盘，面完一场就记一场" />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select value={fCompany} onChange={(e) => setFCompany(e.target.value)} className={selectCls}>
              <option value="">全部公司</option>
              {companies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={fRound} onChange={(e) => setFRound(e.target.value)} className={selectCls}>
              <option value="">全部轮次</option>
              {ROUNDS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={fResult} onChange={(e) => setFResult(e.target.value)} className={selectCls}>
              <option value="">全部结果</option>
              {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {(fCompany || fRound || fResult) ? (
              <button onClick={() => { setFCompany(""); setFRound(""); setFResult(""); }} className="text-xs text-slate-400 hover:text-slate-600">
                清空筛选
              </button>
            ) : null}
            <span className="ml-auto text-xs text-slate-400">{filtered.length} / {sorted.length} 场</span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={MessagesSquare} text="这个筛选条件下没有复盘记录" />
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-soft"
                  onClick={() => setViewing(r)}
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-slate-900">{companyOf(r)}</h3>
                    <Badge>{r.round}</Badge>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${RESULT_STYLE[r.result] || RESULT_STYLE.待定}`}>{r.result}</span>
                    {!r.questions || parseQs(r).length === 0 ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-600">草稿</span> : null}
                    <span className="ml-auto flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star key={i} className={`h-3 w-3 ${i <= Number(r.rating) ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />
                      ))}
                    </span>
                  </div>
                  <p className="line-clamp-1 text-xs text-slate-500">
                    {positionOf(r) ? `${positionOf(r)} · ` : ""}
                    {r.interview_date || "日期未填"}
                    {r.interviewers ? ` · 面试官：${r.interviewers}` : ""}
                    {` · ${parseQs(r).length} 道题`}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <p className="line-clamp-1 flex-1 text-xs text-slate-400">{r.summary}</p>
                    <div className="ml-2 flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="danger" size="sm" onClick={() => remove(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 新增/编辑 */}
      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? "编辑面试复盘" : "记录面试复盘"} wide>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="relative">
              <Label>公司 · 岗位（可搜）</Label>
              {apps.length > 0 ? (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
                    <input
                      value={appQuery}
                      onChange={(e) => { setAppQuery(e.target.value); setAppDropOpen(true); }}
                      onFocus={() => setAppDropOpen(true)}
                      placeholder="搜公司或岗位"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-800 outline-none focus:border-terracotta-400"
                    />
                  </div>
                  {appDropOpen ? (
                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                      {appMatches.length ? (
                        appMatches.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              setForm((f) => ({ ...f, app_id: String(a.id) }));
                              setAppQuery(appLabel(a));
                              setAppDropOpen(false);
                            }}
                            className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-terracotta-50 ${
                              String(a.id) === form.app_id ? "bg-terracotta-50 font-medium text-terracotta-700" : "text-slate-700"
                            }`}
                          >
                            {appLabel(a)}
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-2 text-xs text-slate-400">没有匹配的进行中岗位</p>
                      )}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-slate-400">先去「看板」添加公司</p>
              )}
            </div>
            <div>
              <Label>轮次</Label>
              <div className="flex flex-wrap gap-1">
                {ROUNDS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setForm({ ...form, round: r })}
                    className={`rounded-full px-2.5 py-1 text-xs ${
                      form.round === r ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>日期</Label>
              <Input type="date" value={form.interview_date} onChange={(e) => setForm({ ...form, interview_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>面试官（可选）</Label>
              <Input value={form.interviewers} onChange={(e) => setForm({ ...form, interviewers: e.target.value })} placeholder="如：张三（技术负责人）" />
            </div>
            <div>
              <Label>结果</Label>
              <div className="flex gap-1.5">
                {RESULTS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setForm({ ...form, result: r })}
                    className={`flex-1 rounded-lg py-1.5 text-xs ${
                      form.result === r ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>问题清单（可以空着，之后补）</Label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => { setAiOpen(true); setAiResult(null); }}>
                  <Sparkles className="h-3.5 w-3.5" /> AI 归纳
                </Button>
                <Button type="button" variant="subtle" size="sm" onClick={addQ}><Plus className="h-3.5 w-3.5" /> 加一题</Button>
              </div>
            </div>
            {form.questions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400">
                还没记题目。面试完先存一版结果和整体感觉也行，题目之后随时补。
              </p>
            ) : (
              <div className="space-y-3">
                {form.questions.map((q, i) => (
                  <div key={i} className="relative space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                    <div className="flex gap-2">
                      <Input value={q.q} onChange={(e) => setQ(i, "q", e.target.value)} placeholder={`问题 ${i + 1}，如：讲讲 fencing 方案`} className="flex-1" />
                      <Input value={q.tag} onChange={(e) => setQ(i, "tag", e.target.value)} placeholder="考点标签" className="w-28 shrink-0" />
                      <button onClick={() => delQ(i)} className="shrink-0 text-slate-300 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <Textarea value={q.my_answer} onChange={(e) => setQ(i, "my_answer", e.target.value)} rows={2} placeholder="我当时怎么答的（如实记）" />
                    <Textarea value={q.better_answer} onChange={(e) => setQ(i, "better_answer", e.target.value)} rows={2} placeholder="更好的答法 / 事后查到的标准答案" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-[auto_1fr] items-start gap-4">
            <div>
              <Label>自评</Label>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button key={i} type="button" onClick={() => setForm({ ...form, rating: i })}>
                    <Star className={`h-5 w-5 ${i <= form.rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>整体复盘（可选）</Label>
              <Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} rows={2} placeholder="这场面试的整体感觉、要补的功课…" />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} loading={saving}>保存</Button>
          </div>
        </div>
      </Modal>

      {/* 结果=通过 → 问一句要不要推进看板状态 */}
      <Modal
        open={!!syncAsk}
        onClose={() => setSyncAsk(null)}
        title={syncAsk ? `「${syncAsk.company}」过了 ${form.round}，推进看板状态？` : ""}
      >
        {syncAsk ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              现在：<span className="font-medium text-slate-700">{syncAsk.status || "未填状态"}</span>。点一个新状态就同步过去，不点「跳过」就不动看板。
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {syncCandidates.map((s) => (
                <button
                  key={s}
                  onClick={() => applySync(s)}
                  className="rounded-lg border border-slate-200 px-2.5 py-2 text-left text-xs text-slate-700 transition-colors hover:border-terracotta hover:bg-terracotta-50"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setSyncAsk(null)}>跳过，不动看板</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* AI 归纳 */}
      <Modal open={aiOpen} onClose={() => setAiOpen(false)} title="AI 归纳面试记录" wide>
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-slate-500">
            把面经记录、语音转写或复盘笔记贴进来，AI 会提取被问到的题目、考点，以及你答得好与不好的地方。只依据记录内容，不虚构。
          </p>
          <Textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            rows={8}
            placeholder={"面试官先让自我介绍，然后问了 fencing 方案怎么处理并发冲突……\n（至少 50 字）"}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAiOpen(false)}>取消</Button>
            <Button onClick={aiRun} loading={aiBusy}>开始归纳</Button>
          </div>
          {aiResult ? (
            <div className="space-y-3 rounded-lg border border-terracotta-100 bg-terracotta-50/40 p-3">
              <div className="space-y-2">
                {aiResult.questions.map((q, i) => (
                  <div key={i} className="rounded-lg bg-white p-2.5 text-xs">
                    <p className="font-medium text-slate-800">{i + 1}. {q.q}</p>
                    <p className="mt-0.5 text-slate-400">考点：{q.topic || "—"}</p>
                    {q.good ? <p className="mt-0.5 text-green-700">答得好：{q.good}</p> : null}
                    {q.bad ? <p className="mt-0.5 text-red-500">暴露短板：{q.bad}</p> : null}
                  </div>
                ))}
              </div>
              {aiResult.weak_points?.length ? (
                <div className="text-xs">
                  <p className="mb-1 font-medium text-slate-700">整体短板</p>
                  <ul className="list-disc space-y-0.5 pl-4 text-slate-600">
                    {aiResult.weak_points.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              ) : null}
              {aiResult.prepare?.length ? (
                <div className="text-xs">
                  <p className="mb-1 font-medium text-slate-700">下次面试前准备</p>
                  <ul className="list-disc space-y-0.5 pl-4 text-slate-600">
                    {aiResult.prepare.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              ) : null}
              <div className="flex justify-end">
                <Button size="sm" onClick={aiApply}>填入问题清单</Button>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* 查看详情 */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `${companyOf(viewing)} · ${viewing.round}` : ""} wide>
        {viewing ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <Badge>{viewing.result}</Badge>
              {viewing.status_sync === "1" ? <span className="text-[11px] text-emerald-600">已同步看板状态</span> : null}
              {viewing.interview_date ? <span>{viewing.interview_date}</span> : null}
              {viewing.interviewers ? <span>面试官：{viewing.interviewers}</span> : null}
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => { openEdit(viewing); setViewing(null); }}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="danger" size="sm" onClick={() => remove(viewing)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            {viewing.summary ? <p className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{viewing.summary}</p> : null}
            {parseQs(viewing).length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400">这份还是草稿，题目还没记。点右上角编辑补上。</p>
            ) : (
              <div className="space-y-3">
                {parseQs(viewing).map((q, i) => (
                  <div key={i} className="rounded-lg border border-slate-100 p-3">
                    <p className="mb-1.5 text-sm font-medium text-slate-900">
                      {i + 1}. {q.q}
                      {q.tag ? <span className="ml-2 rounded bg-terracotta-50 px-1.5 py-0.5 text-[11px] font-normal text-terracotta-600">{q.tag}</span> : null}
                    </p>
                    {q.my_answer ? (
                      <p className="mb-1 text-xs leading-relaxed text-slate-500"><span className="text-slate-300">我的回答：</span>{q.my_answer}</p>
                    ) : null}
                    {q.better_answer ? (
                      <p className="text-xs leading-relaxed text-terracotta-700"><span className="text-slate-300">更好的答法：</span>{q.better_answer}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[11px] text-slate-300">{fmtTime(viewing.created_at)}</p>
          </>
        ) : null}
      </Modal>
    </>
  );
}
