// 全局配色约定:求职状态 + 通用标签色
// 颜色语义:teal=待出手 → blue=已投 → purple=笔试 → 暖色系=面试进阶 → green=Offer → 灰=结束
import { useEffect, useState } from "react";
import { listRows } from "./api";

export const JOB_STATUSES = ["待投递", "简历筛选", "投递中", "笔试", "一面", "二面", "三面", "HR面", "Offer", "结束"];

// 色板注册表:tone 名 → 芯片样式。自定义状态/标签配色都从这里取
export const TONES = {
  teal: "bg-teal-50 text-teal-600",
  blue: "bg-blue-50 text-blue-600",
  purple: "bg-purple-50 text-purple-600",
  amber: "bg-amber-50 text-amber-600",
  orange: "bg-orange-50 text-orange-600",
  rose: "bg-rose-50 text-rose-600",
  pink: "bg-pink-50 text-pink-600",
  green: "bg-green-50 text-green-600",
  indigo: "bg-indigo-50 text-indigo-600",
  slate: "bg-slate-100 text-slate-500",
};
export const TONE_NAMES = Object.keys(TONES);
export const toneChip = (tone) => TONES[tone] || TONES.slate;

const JOB_DEFAULT_TONE = {
  待投递: "teal", 投递中: "blue", 笔试: "purple", 一面: "amber", 二面: "orange",
  三面: "rose", HR面: "pink", Offer: "green", 结束: "slate",
};
export const jobStatusStyle = (s) => toneChip(JOB_DEFAULT_TONE[s] || "slate");

// ===== 标签配色:支持用户自定义覆盖(settings.tag_colors),未配置的按名字哈希 =====
let TAG_OVERRIDES = {};
export function registerTagColors(map) { TAG_OVERRIDES = map || {}; }

const TAG_PALETTE = TONE_NAMES.filter((t) => t !== "slate");
export function tagChip(tag) {
  const t = String(tag || "").trim();
  if (!t) return TONES.slate;
  if (TAG_OVERRIDES[t]) return toneChip(TAG_OVERRIDES[t]);
  let h = 0;
  for (const ch of t) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return toneChip(TAG_PALETTE[h % TAG_PALETTE.length]);
}

// ===== 配置读取 hooks(settings 集合:job_statuses / tag_colors) =====
const findSetting = async (key) => {
  try {
    const rows = await listRows("settings");
    const hit = rows.find((r) => r.key === key);
    return hit?.value ? JSON.parse(hit.value) : null;
  } catch {
    return null;
  }
};

// 求职状态:自定义 [{name, tone}] 或默认;styleOf 兼容历史遗留状态值(回落哈希色)
export function useJobStatuses() {
  const [custom, setCustom] = useState(null);
  useEffect(() => {
    let on = true;
    findSetting("job_statuses").then((v) => {
      if (on && Array.isArray(v) && v.length && v.every((s) => s && s.name)) setCustom(v);
    });
    return () => { on = false; };
  }, []);
  const statuses = custom ? custom.map((s) => s.name) : JOB_STATUSES;
  const styleOf = (name) => {
    const hit = custom?.find((s) => s.name === name);
    if (hit) return toneChip(hit.tone);
    // 历史数据里的旧状态:名字哈希取个稳定色,不至于一片灰
    let h = 0;
    for (const ch of String(name || "")) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return toneChip(TAG_PALETTE[h % TAG_PALETTE.length]);
  };
  return { statuses, styleOf };
}

// 标签配色:挂载时拉取并注册,全站 tagChip 生效
export function useTagColors() {
  useEffect(() => {
    findSetting("tag_colors").then((v) => { if (v && typeof v === "object") registerTagColors(v); });
  }, []);
}
