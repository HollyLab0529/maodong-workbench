// 工作区三：跟进。回答「投出去之后谁没理我、我该催谁」。
// 只看已经投出去的岗位，按「投了几天还没动静」排序，越久越靠前。
import { useState } from "react";
import { Bell, MessageSquarePlus, Send, TimerOff, Ghost, ListTodo } from "lucide-react";
import { Button, EmptyState, toast } from "../../components/ui";
import { bulkInsertRows } from "../../api";
import { appliedDays, isApplied, isClosed, isPending, isWaiting, nextActionInfo, dayDiff, todoRow } from "../../jobs";
import { StatusPill, TierChip } from "./bits";

const STUCK_DAYS = 14;

export default function FollowUpView({ apps, cfg, today, patchRow, patchMany, openDetail }) {
  const [minDays, setMinDays] = useState(7);
  const [todoBusy, setTodoBusy] = useState(false);

  // 生成待办：四个块共用，标题文案统一走 jobs.todoRow
  const makeTodos = async (list, action, label) => {
    if (!list.length || todoBusy) return;
    setTodoBusy(true);
    try {
      await bulkInsertRows("todos", list.map((a) => todoRow(a, action, today)));
      toast.success(`已生成 ${list.length} 条待办：${label}`);
    } catch (e) {
      toast.error("生成待办失败：" + e.message);
    } finally {
      setTodoBusy(false);
    }
  };

  const waiting = apps
    .filter((a) => isWaiting(a, cfg.statuses) && a.applied_date)
    .map((a) => ({ a, days: appliedDays(a, today) ?? 0 }))
    .sort((x, y) => y.days - x.days);
  const silent = waiting.filter((w) => w.days >= minDays);

  const reminders = apps
    .filter((a) => a.next_action_date && !isClosed(a, cfg.statuses))
    .map((a) => ({ a, info: nextActionInfo(a, today) }))
    .filter((x) => x.info && x.info.days <= 7)
    .sort((x, y) => x.info.days - y.info.days);

  const stuck = apps
    .filter((a) => {
      if (!isApplied(a, cfg.statuses) || isClosed(a, cfg.statuses)) return false;
      if (!a.status_changed_at) return false;
      const d = dayDiff(String(a.status_changed_at).slice(0, 10), today);
      return d !== null && d >= STUCK_DAYS;
    })
    .map((a) => ({ a, days: dayDiff(String(a.status_changed_at).slice(0, 10), today) }))
    .sort((x, y) => y.days - x.days);

  const closedStatus = (cfg.byGroup("closed").slice(-1)[0] || {}).name || "已取消";

  // 逾期没投：还没投出去、计划日期已经过了
  const overdue = apps
    .filter((a) => isPending(a, cfg.statuses) && a.plan_date && a.plan_date < today)
    .sort((x, y) => String(x.plan_date).localeCompare(String(y.plan_date)));

  const nudge = (a) => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    patchRow(a.id, { next_action: a.next_action || "催一下回复", next_action_date: next });
  };

  if (!waiting.length && !reminders.length && !overdue.length) {
    return <EmptyState icon={Ghost} text="还没有投出去的岗位。先去「今天」把排好的投掉，这里才有得跟。" />;
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800">投了没动静</h3>
          <span className="text-xs text-slate-400">{silent.length} / {waiting.length} 家</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => makeTodos(silent, "催一下回复", "投了没动静")}
              disabled={todoBusy || !silent.length}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            >
              <ListTodo className="h-3 w-3" /> 生成待办
            </button>
            {[3, 7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setMinDays(d)}
                className={`rounded-full px-2.5 py-1 text-[11px] ${
                  minDays === d ? "bg-terracotta text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                ≥{d} 天
              </button>
            ))}
          </div>
        </div>
        {silent.length ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {silent.map(({ a, days }) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2.5 last:border-0">
                <button onClick={() => openDetail(a)} className="min-w-0 flex-1 text-left">
                  <span className="text-sm font-medium text-slate-800">{a.company}</span>
                  <span className="ml-1 text-xs text-slate-400">{a.position || "岗位未填"}</span>
                </button>
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ${days >= 21 ? "bg-red-50 text-red-500" : days >= 14 ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500"}`}>
                  已投 {days} 天
                </span>
                <TierChip tier={a.tier} className="hidden sm:inline-block" />
                <StatusPill status={a.status} styleOf={cfg.styleOf} size="sm" />
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openDetail(a)}
                    className="rounded-lg px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100"
                    title="记一条进展"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => nudge(a)}
                    className="rounded-lg px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100"
                    title="设两天后提醒自己催"
                  >
                    <Bell className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => patchRow(a.id, { status: closedStatus })}
                    className="rounded-lg px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                    title="不跟了"
                  >
                    <TimerOff className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-xs text-slate-400">
            {waiting.length ? `最近投的都在 ${minDays} 天内，给他们一点时间。` : "还没有投递记录。"}
          </p>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800">下一步该做的</h3>
          <span className="text-xs text-slate-400">{reminders.length}</span>
          <span className="text-[11px] text-slate-300">按日期排，过期的在最上面</span>
          <button
            onClick={() => makeTodos(reminders.map((x) => x.a), "待办的事项", "下一步该做的")}
            disabled={todoBusy || !reminders.length}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          >
            <ListTodo className="h-3 w-3" /> 生成待办
          </button>
        </div>
        {reminders.length ? (
          <div className="space-y-1.5">
            {reminders.map(({ a, info }) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <button onClick={() => openDetail(a)} className="min-w-0 flex-1 text-left">
                  <span className="text-sm font-medium text-slate-800">{a.company}</span>
                  <span className="ml-1 text-xs text-slate-500">{a.next_action || "下一步"}</span>
                </button>
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ${
                    info.overdue ? "bg-red-50 text-red-500" : info.today ? "bg-terracotta text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {info.overdue ? `晚了 ${-info.days} 天` : info.today ? "今天" : `${info.date.slice(5)}`}
                </span>
                <Button size="sm" variant="outline" onClick={() => patchRow(a.id, { next_action: "", next_action_date: "" })}>
                  做完了
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-xs text-slate-400">
            没有排着的下一步。想让自己别忘了催，点上面的铃铛。
          </p>
        )}
      </section>

      {stuck.length ? (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">卡住的</h3>
            <span className="text-xs text-slate-400">{stuck.length}</span>
            <span className="text-[11px] text-slate-300">同一个状态超过 {STUCK_DAYS} 天没动</span>
            <button
              onClick={() => makeTodos(stuck.map((x) => x.a), "问一下进展", "卡住的")}
              disabled={todoBusy}
              className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            >
              <ListTodo className="h-3 w-3" /> 生成待办
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stuck.map(({ a, days }) => (
              <button
                key={a.id}
                onClick={() => openDetail(a)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300"
              >
                {a.company}
                <span className="text-[11px] text-slate-400">{a.status} · {days} 天</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {overdue.length ? (
        <section>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">逾期没投</h3>
            <span className="text-xs text-slate-400">{overdue.length}</span>
            <span className="text-[11px] text-slate-300">计划日期过了还没投，要么挪到今天要么周末清一清</span>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => makeTodos(overdue, "投出去", "逾期没投")}
                disabled={todoBusy}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              >
                <ListTodo className="h-3 w-3" /> 生成待办
              </button>
              <Button size="sm" variant="outline" onClick={() => patchMany(overdue.map((a) => a.id), { plan_date: today }, `已把 ${overdue.length} 家挪到今天`)}>
                全部挪到今天
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {overdue.map((a) => (
              <button
                key={a.id}
                onClick={() => openDetail(a)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300"
              >
                {a.company}
                <span className="text-[11px] text-red-400">逾期 {-dayDiff(today, a.plan_date)} 天</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <p className="flex items-center gap-1.5 pb-2 text-[11px] text-slate-300">
        <Send className="h-3.5 w-3.5" /> 投出去之后最容易忘的是「谁还没回」，这页就是替你想这件事的。
      </p>
    </div>
  );
}
