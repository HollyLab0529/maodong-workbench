// 全局配色约定:求职状态 + 通用标签色
// 颜色语义:teal=待出手 → blue=已投 → purple=笔试 → 暖色系=面试进阶 → green=Offer → 灰=结束
import { useEffect, useMemo, useState } from "react";
import { listRows } from "./api";
import { DEFAULT_STATUS_GROUP, DEFAULT_STATUS_SHORT, groupOf as groupOfPure, shortOf as shortOfPure } from "./jobs";

// 求职状态：定死成 10 档，一条线走到底（待投递 → … → Offer ／ 已取消）。
// 不再有「投递中」：没投出去就是待投递，投出去第一步就是简历筛选中。
export const JOB_STATUSES = [
  "待投递", "简历筛选中", "测评中", "笔试中", "一面中", "二面中", "三面中", "HR面中", "Offer", "已取消",
];
// 档位 → tone。整条轴是一根色相渐变：绿灰 → 雾蓝 → 蓝紫 → 紫 → 黄褐 → 橙褐 → 砖红 → 粉灰 → 绿 → 灰
export const JOB_STATUS_TONE = {
  待投递: "teal", 简历筛选中: "blue", 测评中: "indigo", 笔试中: "purple",
  一面中: "amber", 二面中: "orange", 三面中: "rose", HR面中: "pink",
  Offer: "green", 已取消: "slate",
};

// 色板注册表:tone 名 → 莫兰迪灰调芯片样式(index.css .tone-*)。自定义状态/标签配色都从这里取
export const TONES = {
  teal: "tone-teal",
  blue: "tone-blue",
  purple: "tone-purple",
  amber: "tone-amber",
  orange: "tone-orange",
  rose: "tone-rose",
  pink: "tone-pink",
  green: "tone-green",
  indigo: "tone-indigo",
  slate: "tone-slate",
  terracotta: "tone-terracotta",
};
export const TONE_NAMES = Object.keys(TONES);
export const toneChip = (tone) => TONES[tone] || TONES.slate;
// 只染前景色（侧栏图标等不带底色的场景）
export const TONE_FG = Object.fromEntries(TONE_NAMES.map((t) => [t, `tone-fg-${t}`]));

// 历史遗留写法：只用于给尚未迁移的旧值兜个色
const LEGACY_TONE = {
  简历筛选: "blue", 投递中: "blue", 笔试: "purple", 一面: "amber",
  二面: "orange", 三面: "rose", HR面: "pink", 结束: "slate",
};
export const jobStatusStyle = (s) => toneChip(JOB_STATUS_TONE[s] || LEGACY_TONE[s] || "slate");

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
// 进程内缓存：一次会话只拉一次 settings，看板/首页/自定义页反复读同一份，
// 改配置后刷新页面（或下次进站）才生效——与「保存配置后重新进看板生效」的提示一致。
let SETTINGS_CACHE = null;
const findSetting = async (key) => {
  try {
    if (!SETTINGS_CACHE) SETTINGS_CACHE = await listRows("settings");
    const hit = SETTINGS_CACHE.find((r) => r.key === key);
    return hit?.value ? JSON.parse(hit.value) : null;
  } catch {
    return null;
  }
};

// 求职状态:自定义 [{name, tone, group?, short?}] 或默认。
// group 决定它落在「未投 / 已投等消息 / 流程中 / 结束」哪一段；不写就按默认表推断。
export function useJobStatuses() {
  const [custom, setCustom] = useState(null);
  useEffect(() => {
    let on = true;
    findSetting("job_statuses").then((v) => {
      if (on && Array.isArray(v) && v.length && v.every((s) => s && s.name)) setCustom(v);
    });
    return () => { on = false; };
  }, []);
  const config = useMemo(() => {
    if (!custom) {
      return JOB_STATUSES.map((n) => ({
        name: n,
        tone: JOB_STATUS_TONE[n],
        group: DEFAULT_STATUS_GROUP[n] || "",
        short: DEFAULT_STATUS_SHORT[n] || n.slice(0, 2),
      }));
    }
    return custom.map((s) => ({
      name: s.name,
      tone: s.tone,
      group: s.group || DEFAULT_STATUS_GROUP[s.name] || "",
      short: s.short || DEFAULT_STATUS_SHORT[s.name] || String(s.name).slice(0, 2),
    }));
  }, [custom]);
  const statuses = config.map((c) => c.name);
  const styleOf = (name) => {
    const hit = config.find((s) => s.name === name);
    if (hit) return toneChip(hit.tone);
    // 历史数据里的旧状态:名字哈希取个稳定色,不至于一片灰
    let h = 0;
    for (const ch of String(name || "")) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return toneChip(TAG_PALETTE[h % TAG_PALETTE.length]);
  };
  const groupOf = (name) => groupOfPure(name, config);
  const shortOf = (name) => shortOfPure(name, config);
  const byGroup = (g) => config.filter((c) => c.group === g);
  return { statuses, styleOf, config, groupOf, shortOf, byGroup };
}

// 标签配色:挂载时拉取并注册,全站 tagChip 生效
export function useTagColors() {
  useEffect(() => {
    findSetting("tag_colors").then((v) => { if (v && typeof v === "object") registerTagColors(v); });
  }, []);
}
