// 看板里反复出现的小零件：档位芯片、计划徽标、发布徽标、状态胶囊。
// 抽出来是为了四个工作区口径一致——同一家公司在哪儿看都是同一个颜色、同一句话。
import { ChevronDown, Flame, Hourglass } from "lucide-react";
import { toneChip } from "../../colors";
import { TIER_TONE, dayDiff, publishInfo } from "../../jobs";

export function TierChip({ tier, className = "" }) {
  if (!tier) return null;
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ${toneChip(TIER_TONE[tier] || "slate")} ${className}`}>
      {tier}
    </span>
  );
}

// 计划 / 已投：一个位置只讲一件事，避免卡片上堆四五个日期
export function PlanTag({ a, today, className = "" }) {
  if (a.applied_date) {
    return (
      <span className={`whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 ${className}`}>
        已投 {String(a.applied_date).slice(5)}
      </span>
    );
  }
  if (!a.plan_date) {
    return <span className={`whitespace-nowrap text-[11px] text-slate-300 ${className}`}>未排期</span>;
  }
  const diff = dayDiff(today, a.plan_date);
  const cls =
    diff === 0
      ? "bg-terracotta text-white font-medium"
      : diff < 0
        ? "bg-red-50 text-red-500 font-medium"
        : "bg-slate-100 text-slate-500";
  const text = diff === 0 ? "今天投" : diff < 0 ? `逾期 ${-diff} 天` : `计划 ${String(a.plan_date).slice(5)}`;
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ${cls} ${className}`}>{text}</span>;
}

// 只认招聘站写的发布时间；抓不到就不显示，不拿入库时间冒充
export function PublishTag({ a, today, withIcon = true, className = "" }) {
  const info = publishInfo(a, today);
  if (!info) return null;
  const cls = info.fresh ? "text-terracotta-600" : info.stale ? "text-amber-600/90" : "text-slate-400";
  const text = info.fresh ? `新岗 ${info.days} 天` : info.stale ? `挂了 ${info.days} 天` : `发布 ${String(info.date).slice(5)}`;
  const Icon = info.fresh ? Flame : info.stale ? Hourglass : null;
  return (
    <span
      title={info.stale ? "挂了 45 天以上，大概率是常驻岗" : `已发布 ${info.days} 天`}
      className={`inline-flex items-center gap-0.5 whitespace-nowrap text-[11px] ${cls} ${className}`}
    >
      {withIcon && Icon ? <Icon className="h-3 w-3" /> : null}
      {text}
    </span>
  );
}

export function StatusPill({ status, styleOf, onOpen, size = "md" }) {
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  if (!onOpen) {
    return <span className={`inline-flex items-center whitespace-nowrap rounded-full ${pad} ${styleOf(status)}`}>{status}</span>;
  }
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title="点这里改状态"
      className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-full ${pad} ${styleOf(status)}`}
    >
      {status}
      <ChevronDown className="h-3 w-3 opacity-60" />
    </button>
  );
}

// 一包的进度条：已投 / 总数
export function ProgressBar({ done, total, className = "" }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <div
        className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-400" : "bg-terracotta"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function SectionHead({ title, hint, count, children }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {typeof count === "number" ? <span className="text-xs text-slate-400">{count}</span> : null}
      {hint ? <span className="text-[11px] text-slate-300">{hint}</span> : null}
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}
