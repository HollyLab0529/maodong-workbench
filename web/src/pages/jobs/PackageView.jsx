// 工作区二：本包。回答「这一包投到哪了、还差多少、配比健康吗」。
// 一包 = 一次批量投递（batch 字段），卡片里直接给出进度与体检结论，不再让人自己数。
import { useState } from "react";
import { ChevronDown, ChevronRight, Package, Play, CheckCheck, Plus, AlertTriangle, Info } from "lucide-react";
import { Button, EmptyState } from "../../components/ui";
import { groupByBatch, isApplied, isPending, packageStats, policyCheck, sortByPlan } from "../../jobs";
import { ProgressBar, StatusPill, TierChip, PlanTag } from "./bits";

function Issue({ level, text }) {
  const Icon = level === "warn" ? AlertTriangle : Info;
  const cls = level === "warn" ? "text-amber-600" : "text-slate-400";
  return (
    <p className={`flex items-start gap-1 text-[11px] ${cls}`}>
      <Icon className="mt-0.5 h-3 w-3 shrink-0" />
      {text}
    </p>
  );
}

export default function PackageView({
  apps, cfg, today, policy, patchRow, patchMany, markApplied, openDetail, startApply, openForm,
}) {
  const groups = groupByBatch(apps);
  const [open, setOpen] = useState(() => new Set(groups[0] ? [groups[0][0]] : []));

  if (!groups.length) {
    return <EmptyState icon={Package} text="还没有任何一包。加岗位时填个批次（如「包-2026-11-20」），这里就会按包统计。" />;
  }

  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="space-y-3">
      {groups.map(([batch, list]) => {
        const stats = packageStats(list, today);
        const check = policyCheck(stats, policy);
        const expanded = open.has(batch);
        const pendingList = sortByPlan(list.filter((a) => isPending(a, cfg.statuses)), today);
        const doneList = list.filter((a) => isApplied(a, cfg.statuses));
        return (
          <div key={batch} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button onClick={() => toggle(batch)} className="flex min-w-0 items-center gap-1.5 text-left">
                {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                <span className="truncate text-sm font-semibold text-slate-900">{batch}</span>
              </button>
              <span className="text-xs text-slate-400">
                投 {stats.applied}/{stats.total}
              </span>
              <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">
                待投 {stats.pending}
              </span>
              {stats.big ? <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">大厂 {stats.big}</span> : null}
              {stats.fresh ? <span className="rounded-full bg-terracotta-50 px-2 py-0.5 text-[11px] text-terracotta-600">新岗 {stats.fresh}</span> : null}
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                {pendingList.length ? (
                  <Button size="sm" onClick={() => startApply(pendingList)}>
                    <Play className="h-3.5 w-3.5" /> 进投递模式
                  </Button>
                ) : null}
                {pendingList.length ? (
                  <Button size="sm" variant="outline" onClick={() => markApplied(pendingList.map((a) => a.id))}>
                    <CheckCheck className="h-3.5 w-3.5" /> 整包标已投
                  </Button>
                ) : null}
                <button onClick={() => openForm({ batch })} className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-500" title="往这一包里加岗位">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
            <ProgressBar done={stats.applied} total={stats.total} className="mb-2" />
            {check.issues.length ? (
              <div className="mb-2 space-y-0.5">
                {check.issues.map((i, idx) => (
                  <Issue key={idx} level={i.level} text={i.text} />
                ))}
              </div>
            ) : null}

            {expanded ? (
              <div className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
                {sortByPlan(list, today).map((a) => (
                  <div key={a.id} className="flex items-center gap-2 py-2">
                    <button onClick={() => openDetail(a)} className="min-w-0 flex-1 text-left">
                      <span className="truncate text-sm text-slate-800">{a.company}</span>
                      <span className="ml-1 text-xs text-slate-400">{a.position || "岗位未填"}</span>
                    </button>
                    <TierChip tier={a.tier} className="hidden sm:inline-block" />
                    <PlanTag a={a} today={today} />
                    <StatusPill status={a.status} styleOf={cfg.styleOf} size="sm" />
                    {isPending(a, cfg.statuses) ? (
                      <button
                        onClick={() => markApplied([a.id])}
                        className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500 hover:border-terracotta hover:text-terracotta-600"
                      >
                        已投
                      </button>
                    ) : (
                      <button
                        onClick={() => patchRow(a.id, { plan_date: today, status: (cfg.byGroup("todo")[0] || {}).name || cfg.statuses[0] })}
                        className="rounded px-1.5 py-0.5 text-[11px] text-slate-300 hover:text-slate-500"
                        title="放回待投"
                      >
                        重投
                      </button>
                    )}
                  </div>
                ))}
                {doneList.length ? <p className="py-1.5 text-[11px] text-slate-300">已完成 {doneList.length} 家</p> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
