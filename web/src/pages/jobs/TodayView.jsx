// 工作区一：今天。回答唯一一个问题——我现在该投哪几家。
// 只放三堆：今天要投的、逾期没投的、今天已经投完的（灰掉做心理奖励）。
import { CalendarCheck2, CalendarClock, Play, ArrowRight, Sparkles } from "lucide-react";
import { Button, Checkbox, EmptyState } from "../../components/ui";
import { isPending, sortByPlan } from "../../jobs";
import { PlanTag, PublishTag, TierChip, SectionHead } from "./bits";

function TaskRow({ a, today, checked, onCheck, onApplied, onOpen, onReschedule, dim = false }) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
        dim ? "border-slate-100 bg-slate-50/60" : checked ? "border-terracotta/50 bg-terracotta-50/40" : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <span className="mt-0.5 shrink-0">
        <Checkbox checked={checked} onChange={onCheck} />
      </span>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className={`truncate text-sm ${dim ? "text-slate-400" : "font-medium text-slate-900"}`}>
          {a.company}
          <span className={`ml-1 text-xs font-normal ${dim ? "text-slate-400" : "text-slate-500"}`}>{a.position || "岗位未填"}</span>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
          <PlanTag a={a} today={today} />
          <TierChip tier={a.tier} />
          {a.city || a.location ? <span>{a.city || a.location}</span> : null}
          <PublishTag a={a} today={today} />
          {a.note ? <span className="truncate text-slate-300">{a.note}</span> : null}
        </p>
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        {dim ? (
          <span className="text-xs text-emerald-500">✓ 已投</span>
        ) : (
          <>
            {onReschedule ? (
              <button
                onClick={onReschedule}
                className="hidden rounded-lg px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-600 sm:block"
                title="改计划日期"
              >
                挪日期
              </button>
            ) : null}
            <Button size="sm" variant="outline" onClick={onApplied} className="whitespace-nowrap">
              已投
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function TodayView({
  apps, cfg, today, sel, toggleSel, setSel,
  markApplied, patchRow, patchMany, openDetail, openForm, startApply,
}) {
  const pending = apps.filter((a) => isPending(a, cfg.statuses));
  const todayList = sortByPlan(pending.filter((a) => a.plan_date === today), today);
  const overdue = sortByPlan(pending.filter((a) => a.plan_date && a.plan_date < today), today);
  const unscheduled = pending.filter((a) => !a.plan_date);
  const appliedToday = apps.filter((a) => a.applied_date === today);
  const allToday = [...overdue, ...todayList];

  if (!apps.length) {
    return <EmptyState icon={Sparkles} text="还没有岗位记录。点右上角「加岗位」，或者直接把招聘页链接粘进来。" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-sm text-slate-700">
          今天要投 <span className="text-lg font-semibold text-terracotta">{allToday.length}</span> 家
          <span className="ml-2 text-xs text-slate-400">已投 {appliedToday.length} 家</span>
          {overdue.length ? <span className="ml-2 text-xs text-red-500">逾期 {overdue.length} 家</span> : null}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {allToday.length ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setSel(new Set(allToday.map((a) => a.id)))}>
                全选
              </Button>
              <Button size="sm" onClick={() => startApply(allToday)}>
                <Play className="h-3.5 w-3.5" /> 按顺序开投
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => openForm({ mode: "pick" })}>
              从候选里挑几家
            </Button>
          )}
        </div>
      </div>

      {overdue.length ? (
        <section>
          <SectionHead title="逾期没投" count={overdue.length} hint="计划日期已经过了，挪到今天重排，或者直接投掉">
            <button
              onClick={() => patchMany(overdue.map((a) => a.id), { plan_date: today })}
              className="inline-flex items-center gap-1 text-xs text-terracotta-600 hover:underline"
            >
              <CalendarClock className="h-3.5 w-3.5" /> 全部挪到今天
            </button>
          </SectionHead>
          <div className="space-y-1.5">
            {overdue.map((a) => (
              <TaskRow
                key={a.id}
                a={a}
                today={today}
                checked={sel.has(a.id)}
                onCheck={() => toggleSel(a.id)}
                onApplied={() => markApplied([a.id])}
                onOpen={() => openDetail(a)}
                onReschedule={() => patchRow(a.id, { plan_date: today })}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHead title="今天要投" count={todayList.length} hint="投完点「已投」，状态会自己往前走一步" />
        {todayList.length ? (
          <div className="space-y-1.5">
            {todayList.map((a) => (
              <TaskRow
                key={a.id}
                a={a}
                today={today}
                checked={sel.has(a.id)}
                onCheck={() => toggleSel(a.id)}
                onApplied={() => markApplied([a.id])}
                onOpen={() => openDetail(a)}
                onReschedule={() => patchRow(a.id, { plan_date: "" })}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
            今天还没排投递。
            {unscheduled.length ? (
              <button onClick={() => openForm({ mode: "pick" })} className="ml-1 text-terracotta-600 hover:underline">
                从 {unscheduled.length} 家没排期的候选里挑几家 →
              </button>
            ) : (
              "去「全量」里加两家新岗位。"
            )}
          </div>
        )}
      </section>

      {appliedToday.length ? (
        <section>
          <SectionHead title="今天已投" count={appliedToday.length} hint="翻回去看也知道今天干了什么" />
          <div className="space-y-1.5">
            {appliedToday.map((a) => (
              <TaskRow key={a.id} a={a} today={today} dim checked={false} onCheck={() => {}} onOpen={() => openDetail(a)} />
            ))}
          </div>
        </section>
      ) : null}

      {unscheduled.length ? (
        <section>
          <SectionHead title="候选池里还有" count={unscheduled.length} hint="没排日期就不会出现在今天，别攒着" />
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.slice(0, 12).map((a) => (
              <button
                key={a.id}
                onClick={() => patchRow(a.id, { plan_date: today })}
                title="排到今天"
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:border-terracotta hover:text-terracotta-600"
              >
                {a.company}
                <ArrowRight className="h-3 w-3 opacity-40" />
              </button>
            ))}
            {unscheduled.length > 12 ? <span className="px-1 py-1 text-xs text-slate-400">还有 {unscheduled.length - 12} 家…</span> : null}
          </div>
        </section>
      ) : null}

      <p className="flex items-center gap-1.5 pb-2 text-[11px] text-slate-300">
        <CalendarCheck2 className="h-3.5 w-3.5" />
        勾选多家可以用下面的浮条批量标已投、批量挪日期。
      </p>
    </div>
  );
}
