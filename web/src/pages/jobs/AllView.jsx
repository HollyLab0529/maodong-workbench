// 工作区四：全量。回答「我总共有哪些」——搜索、按档位/批次/城市/公司类型筛，
// 漏斗和日历在这里才成立（前三个工作区只关心「今天要干什么」）。
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays, ExternalLink, LayoutGrid, List, Search, X, Building2, MapPin, Link2, AlertTriangle, FileUp,
} from "lucide-react";
import { Button, Input, Checkbox, EmptyState, Badge } from "../../components/ui";
import {
  STATUS_GROUPS, TIERS, cityOf, groupOf, isPending, normalizeStatus, pad, publishInfo, sortByPlan,
} from "../../jobs";
import { TierChip, PlanTag, PublishTag, StatusPill } from "./bits";

const CITIES = ["北京", "天津", "上海", "其他"];
const TYPES = ["大厂", "中小厂", "其他"];

export default function AllView({
  apps, cfg, today, sel, toggleSel, setSel, patchRow, markApplied, openDetail, onStatusOpen,
  resumes = [], focusResume, openImport,
}) {
  const [view, setView] = useState("table");
  const [q, setQ] = useState("");
  const [fTier, setFTier] = useState("");
  const [fBatch, setFBatch] = useState("");
  const [fCity, setFCity] = useState("");
  const [fType, setFType] = useState("");
  const [fResume, setFResume] = useState("");
  const [fSource, setFSource] = useState("");
  const [fFresh, setFFresh] = useState(false);
  const [fStatus, setFStatus] = useState("");
  const [fGroup, setFGroup] = useState("");

  // 从简历库跳进来：只留「简历版本」这一个条件，其他筛选全清，避免筛出空结果
  useEffect(() => {
    if (!focusResume?.id) return;
    setQ(""); setFTier(""); setFBatch(""); setFCity(""); setFType(""); setFStatus(""); setFGroup("");
    setFSource(""); setFFresh(false);
    setFResume(String(focusResume.id));
  }, [focusResume]);

  const batchOptions = useMemo(
    () => Array.from(new Set(apps.map((a) => a.batch).filter(Boolean))).sort((x, y) => y.localeCompare(x)),
    [apps]
  );
  const sourceOptions = useMemo(
    () => Array.from(new Set(apps.map((a) => a.source).filter(Boolean))).sort(),
    [apps]
  );
  // 发布时间没填的行判断不了新不新，单独提示，别默默漏掉
  const noPublish = useMemo(() => apps.filter((a) => !a.publish_date).length, [apps]);

  const base = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return apps.filter((a) => {
      if (fTier && (a.tier || "") !== fTier) return false;
      if (fBatch && (a.batch || "") !== fBatch) return false;
      if (fCity && cityOf(a) !== fCity) return false;
      if (fType && (a.company_type || "") !== fType) return false;
      if (fResume && String(a.resume_id || "") !== fResume) return false;
      if (fSource && (a.source || "") !== fSource) return false;
      if (fFresh && !publishInfo(a, today)?.fresh) return false;
      if (!kw) return true;
      return [a.company, a.position, a.jd_code, a.location, a.business, a.note, a.source, a.next_action]
        .some((v) => String(v || "").toLowerCase().includes(kw));
    });
  }, [apps, q, fTier, fBatch, fCity, fType, fResume, fSource, fFresh, today]);

  const statusCounts = useMemo(() => {
    const map = {};
    base.forEach((a) => {
      const s = normalizeStatus(a.status, cfg.statuses);
      map[s] = (map[s] || 0) + 1;
    });
    return map;
  }, [base, cfg.statuses]);

  const groupCounts = useMemo(() => {
    const map = {};
    base.forEach((a) => {
      const g = groupOf(a.status, cfg.config) || "unknown";
      map[g] = (map[g] || 0) + 1;
    });
    return map;
  }, [base, cfg.config]);

  const shown = useMemo(() => {
    const rows = base.filter((a) => {
      if (fStatus && normalizeStatus(a.status, cfg.statuses) !== fStatus) return false;
      if (fGroup && groupOf(a.status, cfg.config) !== fGroup) return false;
      return true;
    });
    return sortByPlan(rows, today).sort((a, b) => {
      // 未投的按计划日期排，已投的往后放，整体不跳来跳去
      const pa = isPending(a, cfg.statuses) ? 0 : 1;
      const pb = isPending(b, cfg.statuses) ? 0 : 1;
      return pa - pb;
    });
  }, [base, fStatus, fGroup, cfg, today]);

  const hasFilter = !!(q.trim() || fTier || fBatch || fCity || fType || fResume || fSource || fFresh || fStatus || fGroup);
  const clearAll = () => {
    setQ(""); setFTier(""); setFBatch(""); setFCity(""); setFType(""); setFResume(""); setFStatus(""); setFGroup("");
    setFSource(""); setFFresh(false);
  };

  // 日历：按计划投递日期铺
  const [cursor, setCursor] = useState(() => today.slice(0, 7));
  const calCells = useMemo(() => {
    const [y, m] = cursor.split("-").map(Number);
    const firstWeekday = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    const days = new Date(y, m, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
    for (let d = 1; d <= days; d += 1) cells.push(`${y}-${pad(m)}-${pad(d)}`);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);
  const byPlanDate = useMemo(() => {
    const map = {};
    shown.forEach((a) => {
      if (!a.plan_date) return;
      (map[a.plan_date] = map[a.plan_date] || []).push(a);
    });
    return map;
  }, [shown]);
  const shiftMonth = (n) => {
    const [y, m] = cursor.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setCursor(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };
  const [dayDetail, setDayDetail] = useState(null);

  const selectCls =
    "rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600 outline-none focus:border-terracotta";

  return (
    <div>
      {/* 漏斗：按语义组看，点组看整段，点状态看单档 */}
      <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {STATUS_GROUPS.map((g) => {
          const n = groupCounts[g.key] || 0;
          const active = fGroup === g.key;
          return (
            <button
              key={g.key}
              onClick={() => {
                setFStatus("");
                setFGroup(active ? "" : g.key);
              }}
              className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                active ? "border-terracotta bg-terracotta/5" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span className="block text-[11px] text-slate-400">{g.label}</span>
              <span className={`block text-xl font-semibold leading-tight ${n ? "text-slate-800" : "text-slate-300"}`}>{n}</span>
            </button>
          );
        })}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {cfg.config.map((c) => {
          const n = statusCounts[c.name] || 0;
          const active = fStatus === c.name;
          return (
            <button
              key={c.name}
              onClick={() => {
                setFGroup("");
                setFStatus(active ? "" : c.name);
              }}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                active ? "border-terracotta bg-terracotta/10 text-terracotta-700" : n ? "border-slate-200 bg-white text-slate-600 hover:border-slate-300" : "border-slate-100 bg-slate-50/60 text-slate-300"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${n ? cfg.styleOf(c.name).replace("tone-", "tone-fg-") : "bg-slate-200"}`} />
              {c.name}
              <span className="tabular-nums">{n}</span>
            </button>
          );
        })}
      </div>

      {/* 搜索与筛选：各管一维，能叠加 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜公司 / 岗位 / JD 编号 / 地点 / 备注" className="pl-8" />
        </div>
        <select value={fTier} onChange={(e) => setFTier(e.target.value)} className={selectCls}>
          <option value="">全部档位</option>
          {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={fBatch} onChange={(e) => setFBatch(e.target.value)} className={selectCls}>
          <option value="">全部批次</option>
          {batchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={fCity} onChange={(e) => setFCity(e.target.value)} className={selectCls}>
          <option value="">全部城市</option>
          {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value)} className={selectCls}>
          <option value="">全部公司类型</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={fResume} onChange={(e) => setFResume(e.target.value)} className={selectCls}>
          <option value="">全部简历版本</option>
          {resumes.map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
        </select>
        <select value={fSource} onChange={(e) => setFSource(e.target.value)} className={selectCls}>
          <option value="">全部来源</option>
          {sourceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button
          onClick={() => setFFresh(!fFresh)}
          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs ${
            fFresh ? "border-terracotta bg-terracotta/10 text-terracotta-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          只看新岗
        </button>
        {hasFilter ? (
          <button onClick={clearAll} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-3.5 w-3.5" /> 清空
          </button>
        ) : null}
        {openImport ? (
          <button
            onClick={openImport}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600 hover:border-terracotta hover:text-terracotta-600"
            title="粘贴 JSON / CSV / Markdown 表格批量导入"
          >
            <FileUp className="h-3.5 w-3.5" /> 批量导入
          </button>
        ) : null}
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          <button onClick={() => setView("table")} title="表格" className={`rounded-md px-2 py-1.5 ${view === "table" ? "bg-terracotta text-white" : "text-slate-400 hover:bg-slate-50"}`}>
            <List className="h-4 w-4" />
          </button>
          <button onClick={() => setView("cards")} title="卡片" className={`rounded-md px-2 py-1.5 ${view === "cards" ? "bg-terracotta text-white" : "text-slate-400 hover:bg-slate-50"}`}>
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button onClick={() => setView("calendar")} title="日历" className={`rounded-md px-2 py-1.5 ${view === "calendar" ? "bg-terracotta text-white" : "text-slate-400 hover:bg-slate-50"}`}>
            <CalendarDays className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="mb-2 text-[11px] text-slate-400">
        命中 {shown.length} 家{hasFilter ? `（全量 ${apps.length}）` : ""}
        {noPublish ? <span className="ml-2 text-amber-500">{noPublish} 条没填发布时间，判断不了新旧</span> : null}
        {shown.length ? <button onClick={() => setSel(new Set(shown.map((a) => a.id)))} className="ml-2 text-terracotta-600 hover:underline">全选这些</button> : null}
      </p>

      {!shown.length ? (
        <EmptyState icon={Building2} text={apps.length ? "这个筛选下没有记录，换个条件试试" : "还没有岗位记录，先加一家"} />
      ) : view === "calendar" ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button onClick={() => shiftMonth(-1)} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">‹</button>
              <span className="text-sm font-medium text-slate-700">{cursor.replace("-", " 年 ")} 月</span>
              <button onClick={() => shiftMonth(1)} className="rounded px-2 py-1 text-slate-400 hover:bg-slate-100">›</button>
            </div>
            <button onClick={() => setCursor(today.slice(0, 7))} className="rounded px-2 py-1 text-xs text-terracotta-600 hover:bg-terracotta-50">
              回到本月
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400">
            {["一", "二", "三", "四", "五", "六", "日"].map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calCells.map((date, i) => {
              if (!date) return <div key={`e${i}`} className="min-h-[64px] rounded-lg bg-slate-50/40" />;
              const list = byPlanDate[date] || [];
              const isToday = date === today;
              const tally = {};
              list.forEach((a) => {
                const s = normalizeStatus(a.status, cfg.statuses);
                tally[s] = (tally[s] || 0) + 1;
              });
              const names = cfg.statuses.filter((n) => tally[n]);
              return (
                <button
                  key={date}
                  onClick={() => (list.length ? setDayDetail(date) : null)}
                  className={`min-h-[64px] rounded-lg border p-1 text-left transition-colors ${
                    isToday ? "border-terracotta/50 bg-terracotta-50/40" : "border-slate-100 bg-white"
                  } ${list.length ? "hover:border-slate-300" : "cursor-default"}`}
                >
                  <div className={`mb-0.5 text-[11px] ${isToday ? "font-semibold text-terracotta-600" : "text-slate-400"}`}>{Number(date.slice(8))}</div>
                  <div className="flex flex-wrap gap-0.5">
                    {names.slice(0, 3).map((n) => (
                      <span key={n} title={`${n} ${tally[n]} 个`} className={`rounded px-1 text-[10px] font-semibold leading-4 ${cfg.styleOf(n)}`}>
                        {tally[n]}{cfg.shortOf(n)}
                      </span>
                    ))}
                    {names.length > 3 ? <span className="px-0.5 text-[10px] leading-4 text-slate-400">+{names.length - 3}</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
          {dayDetail ? (
            <div className="mt-3 rounded-xl border border-slate-200 p-3">
              <div className="mb-1.5 flex items-center">
                <span className="text-xs font-medium text-slate-700">{dayDetail}</span>
                <button onClick={() => setDayDetail(null)} className="ml-auto text-slate-300 hover:text-slate-500"><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="space-y-0.5">
                {(byPlanDate[dayDetail] || []).map((a) => (
                  <button key={a.id} onClick={() => openDetail(a)} className="flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
                    <span className="min-w-0 truncate text-sm text-slate-800">
                      {a.company}<span className="ml-1 text-xs text-slate-400">{a.position}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${cfg.styleOf(a.status)}`}>{a.status}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : view === "table" ? (
        <>
          {/* 桌面表格 */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/80 text-[11px] text-slate-400">
                  <tr>
                    <th className="w-8 px-2 py-2" />
                    <th className="px-2 py-2 font-medium">公司 / 岗位</th>
                    <th className="px-2 py-2 font-medium">城市</th>
                    <th className="px-2 py-2 font-medium">发布</th>
                    <th className="px-2 py-2 font-medium">档位</th>
                    <th className="px-2 py-2 font-medium">计划</th>
                    <th className="px-2 py-2 font-medium">状态</th>
                    <th className="px-2 py-2 font-medium">链接</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {shown.map((a) => (
                    <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-2 py-2"><Checkbox checked={sel.has(a.id)} onChange={() => toggleSel(a.id)} /></td>
                      <td className="px-2 py-2">
                        <button onClick={() => openDetail(a)} className="block max-w-[300px] truncate text-left">
                          <span className="font-medium text-slate-800">{a.company}</span>
                          <span className="text-slate-400"> · {a.position || "岗位未填"}</span>
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-500">{a.city || a.location || "—"}</td>
                      <td className="whitespace-nowrap px-2 py-2"><PublishTag a={a} today={today} withIcon={false} /></td>
                      <td className="px-2 py-2">{a.tier ? <TierChip tier={a.tier} /> : <span className="text-slate-300">—</span>}</td>
                      <td className="whitespace-nowrap px-2 py-2"><PlanTag a={a} today={today} /></td>
                      <td className="px-2 py-2">
                        <StatusPill status={normalizeStatus(a.status, cfg.statuses)} styleOf={cfg.styleOf} size="sm" onOpen={() => onStatusOpen(a)} />
                      </td>
                      <td className="px-2 py-2">
                        {a.link ? (
                          <a href={a.link} target="_blank" rel="noreferrer" title="打开岗位页" className="inline-flex text-terracotta-600 hover:underline">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <span className="text-amber-500" title="还没有链接"><AlertTriangle className="h-3.5 w-3.5" /></span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {isPending(a, cfg.statuses) ? (
                          <button
                            onClick={() => markApplied([a.id])}
                            className="whitespace-nowrap rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500 hover:border-terracotta hover:text-terracotta-600"
                          >
                            标记已投
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 移动端卡片：表格在手机上没法读，直接换形态 */}
          <div className="space-y-1.5 md:hidden">
            {shown.map((a) => (
              <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start gap-2">
                  <Checkbox checked={sel.has(a.id)} onChange={() => toggleSel(a.id)} />
                  <button onClick={() => openDetail(a)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium text-slate-900">{a.company}</p>
                    <p className="truncate text-xs text-slate-400">{a.position || "岗位未填"}</p>
                  </button>
                  <StatusPill status={normalizeStatus(a.status, cfg.statuses)} styleOf={cfg.styleOf} size="sm" onOpen={() => onStatusOpen(a)} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-7 text-[11px] text-slate-400">
                  <PlanTag a={a} today={today} />
                  <TierChip tier={a.tier} />
                  {a.city || a.location ? <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{a.city || a.location}</span> : null}
                  <PublishTag a={a} today={today} />
                  {a.link ? (
                    <a href={a.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-terracotta-600">
                      <Link2 className="h-3 w-3" /> 链接
                    </a>
                  ) : null}
                </div>
                {isPending(a, cfg.statuses) ? (
                  <div className="mt-2 flex gap-1.5 pl-7">
                    <Button size="sm" variant="outline" onClick={() => markApplied([a.id])}>已投</Button>
                    <Button size="sm" variant="ghost" onClick={() => patchRow(a.id, { plan_date: today })}>排今天</Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start gap-2">
                <Checkbox checked={sel.has(a.id)} onChange={() => toggleSel(a.id)} />
                <button onClick={() => openDetail(a)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium text-slate-900">{a.company}</p>
                  <p className="truncate text-xs text-slate-400">{a.position || "岗位未填"}</p>
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusPill status={normalizeStatus(a.status, cfg.statuses)} styleOf={cfg.styleOf} size="sm" onOpen={() => onStatusOpen(a)} />
                <PlanTag a={a} today={today} />
                <TierChip tier={a.tier} />
                <PublishTag a={a} today={today} />
              </div>
              {a.note ? <p className="mt-1.5 line-clamp-2 text-[11px] text-slate-400">{a.note}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
