import {
  LayoutDashboard,
  BookOpen,
  Target,
  CheckSquare,
  CalendarDays,
  Wallet,
  StickyNote,
  History,
  FileBarChart,
  Dumbbell,
  Sparkles,
  BookMarked,
  Scale,
  BedDouble,
  CreditCard,
  Plane,
  ChefHat,
  MessageSquareHeart,
  AlarmClock,
  KeyRound,
  Gift,
} from "lucide-react";

/**
 * 模块注册表：
 * - core: 总览，不可移除
 * - defaultOn: 首次使用默认启用
 * - tone: 图标色调（模块超市等处的色块，与 colors.js TONES 对齐，terracotta 为品牌色）
 * - 其余进「模块超市」，用户按需获取/移除
 */
export const MODULES = [
  { id: "dashboard", title: "总览", to: "/", icon: LayoutDashboard, core: true, defaultOn: true, tone: "terracotta", desc: "今日待办、求职进展与最近沉淀" },
  { id: "kb", title: "知识库", to: "/kb", icon: BookOpen, defaultOn: true, tone: "indigo", desc: "分类 + 标签 + Markdown，你的第二大脑" },
  { id: "jobs", title: "求职进度", to: "/jobs", icon: Target, defaultOn: true, tone: "orange", desc: "公司看板、面试复盘、简历库与 Offer 对比" },
  { id: "todos", title: "待办", to: "/todos", icon: CheckSquare, defaultOn: true, tone: "green", desc: "优先级、截止日期、重复任务与提醒" },
  { id: "calendar", title: "日历", to: "/calendar", icon: CalendarDays, defaultOn: true, tone: "teal", desc: "月视图看待办、随记与纪念日" },
  { id: "expenses", title: "记账", to: "/expenses", icon: Wallet, defaultOn: true, tone: "amber", desc: "分类汇总、预算与趋势" },
  { id: "notes", title: "随笔记", to: "/notes", icon: StickyNote, defaultOn: true, tone: "pink", desc: "模板化速记，可一键升级为文章" },
  { id: "timeline", title: "时间线", to: "/timeline", icon: History, defaultOn: true, tone: "purple", desc: "所有动态按日期回看" },
  { id: "report", title: "周报", to: "/report", icon: FileBarChart, defaultOn: true, tone: "blue", desc: "一键汇总本周/本月，复制或存入知识库" },
  // —— 模块超市（默认未获取）——
  { id: "fitness", title: "健身", to: "/fitness", icon: Dumbbell, defaultOn: false, tone: "orange", desc: "记录每次训练：部位、动作、组数与重量" },
  { id: "habits", title: "习惯打卡", to: "/habits", icon: Sparkles, defaultOn: false, tone: "pink", desc: "自定义习惯，一周 7 格点一点" },
  { id: "reading", title: "书影音", to: "/reading", icon: BookMarked, defaultOn: false, tone: "purple", desc: "书 / 影 / 剧清单，标记状态与评分" },
  { id: "weight", title: "体重记录", to: "/weight", icon: Scale, defaultOn: false, tone: "teal", desc: "每日体重与体脂，趋势一眼看清" },
  { id: "sleep", title: "睡眠打卡", to: "/sleep", icon: BedDouble, defaultOn: false, tone: "indigo", desc: "记录入睡起床，看本周睡得怎么样" },
  { id: "subs", title: "订阅管理", to: "/subs", icon: CreditCard, defaultOn: false, tone: "amber", desc: "会员 / 软件 / 云盘，月花多少钱一目了然" },
  { id: "expiry", title: "过期提醒", to: "/expiry", icon: AlarmClock, defaultOn: false, tone: "rose", desc: "调料 / 化妆品 / 药品的到期日，临期倒计时 + 提醒" },
  { id: "accounts", title: "账号管理", to: "/accounts", icon: KeyRound, defaultOn: false, tone: "slate", desc: "各平台账号密码集中记，一键复制 + 强度 / 重复检查" },
  { id: "trips", title: "旅行清单", to: "/trips", icon: Plane, defaultOn: false, tone: "teal", desc: "行程计划 + 行前待办清单" },
  { id: "wishes", title: "心愿清单", to: "/wishes", icon: Gift, defaultOn: false, tone: "rose", desc: "想买 / 想去 / 想做，状态推进 + 预算链接" },
  { id: "recipes", title: "菜谱收藏", to: "/recipes", icon: ChefHat, defaultOn: false, tone: "green", desc: "收藏想做的菜，食材步骤都在" },
  { id: "feedback", title: "反馈看板", to: "/feedback", icon: MessageSquareHeart, defaultOn: false, tone: "pink", desc: "作品集的访客留言与访问统计" },
];

export const DEFAULT_ENABLED = MODULES.filter((m) => m.defaultOn).map((m) => m.id);

// ===== 导航分组：默认分组 + 用户自定义(settings.nav_groups) =====
// 不进分组的模块（总览在顶，模块超市/设置在底），未归组的启用模块进「未分组」
export const UNGROUPED_IDS = ["dashboard", "feedback"];
export const DEFAULT_GROUPS = [
  { name: "记录沉淀", modules: ["kb", "notes", "timeline", "report"] },
  { name: "求职", modules: ["jobs", "todos", "calendar"] },
  { name: "生活", modules: ["expenses", "wishes", "trips", "recipes", "habits"] },
  { name: "工具箱", modules: ["reading", "fitness", "weight", "sleep", "subs", "expiry", "accounts"] },
];

/**
 * 解析导航分组：用户配置(settings.nav_groups)优先，缺失/无效时回落默认；
 * 只保留当前已启用且注册过的模块；新启用的模块自动落到「未分组」
 */
export function resolveNavGroups(user) {
  const enabled = resolveModules(user).filter((m) => !UNGROUPED_IDS.includes(m.id));
  const byId = Object.fromEntries(enabled.map((m) => [m.id, m]));
  let conf = null;
  try {
    const v = user?.nav_groups;
    if (Array.isArray(v) && v.length && v.every((g) => g && typeof g.name === "string" && Array.isArray(g.modules))) conf = v;
  } catch { /* 回落默认 */ }
  const raw = conf || DEFAULT_GROUPS;
  const used = new Set();
  const groups = raw
    .map((g) => ({
      name: g.name,
      modules: g.modules.filter((id) => byId[id] && !used.has(id)).map((id) => {
        used.add(id);
        return byId[id];
      }),
    }))
    .filter((g) => g.modules.length);
  const rest = enabled.filter((m) => !used.has(m.id));
  if (rest.length) groups.push({ name: "未分组", modules: rest, rest: true });
  return groups;
}

/** 根据用户配置解析出有序、已启用的模块列表 */
export function resolveModules(user) {
  const conf = user?.modules;
  const enabled = conf?.enabled?.length ? conf.enabled : DEFAULT_ENABLED;
  const order = conf?.order?.length ? conf.order : DEFAULT_ENABLED;
  const byId = Object.fromEntries(MODULES.map((m) => [m.id, m]));
  const list = order.filter((id) => enabled.includes(id) && byId[id]).map((id) => byId[id]);
  // 启用了但没排进 order 的，补到末尾
  for (const id of enabled) if (byId[id] && !list.some((m) => m.id === id)) list.push(byId[id]);
  // 总览永远置顶
  return list.sort((a, b) => (a.core ? -1 : b.core ? 1 : 0));
}
