// 全局配色约定:求职状态 + 通用标签色
// 颜色语义:teal=待出手 → blue=已投 → purple=笔试 → 暖色系=面试进阶 → green=Offer → 灰=结束
export const JOB_STATUSES = ["待投递", "投递中", "笔试", "一面", "二面", "三面", "HR面", "Offer", "结束"];

export const JOB_STATUS_STYLE = {
  待投递: "bg-teal-50 text-teal-600",
  投递中: "bg-blue-50 text-blue-600",
  笔试: "bg-purple-50 text-purple-600",
  一面: "bg-amber-50 text-amber-600",
  二面: "bg-orange-50 text-orange-600",
  三面: "bg-rose-50 text-rose-600",
  HR面: "bg-pink-50 text-pink-600",
  Offer: "bg-green-50 text-green-600",
  结束: "bg-slate-100 text-slate-400",
};

export const jobStatusStyle = (s) => JOB_STATUS_STYLE[s] || "bg-slate-100 text-slate-500";

// 标签配色:同一标签永远同色(名字哈希),不同标签大概率不同色
const TAG_PALETTE = [
  "bg-sky-50 text-sky-700",
  "bg-amber-50 text-amber-700",
  "bg-violet-50 text-violet-700",
  "bg-emerald-50 text-emerald-700",
  "bg-rose-50 text-rose-700",
  "bg-cyan-50 text-cyan-700",
  "bg-orange-50 text-orange-700",
  "bg-fuchsia-50 text-fuchsia-700",
  "bg-lime-50 text-lime-700",
  "bg-indigo-50 text-indigo-700",
];

export function tagChip(tag) {
  const t = String(tag || "").trim();
  if (!t) return "bg-slate-100 text-slate-600";
  let h = 0;
  for (const ch of t) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}
