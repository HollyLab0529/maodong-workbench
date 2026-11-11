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
} from "lucide-react";

/**
 * 模块注册表：
 * - core: 总览，不可移除
 * - defaultOn: 首次使用默认启用
 * - 其余进「模块超市」，用户按需获取/移除
 */
export const MODULES = [
  { id: "dashboard", title: "总览", to: "/", icon: LayoutDashboard, core: true, defaultOn: true, desc: "今日待办、求职进展与最近沉淀" },
  { id: "kb", title: "知识库", to: "/kb", icon: BookOpen, defaultOn: true, desc: "分类 + 标签 + Markdown，你的第二大脑" },
  { id: "jobs", title: "求职进度", to: "/jobs", icon: Target, defaultOn: true, desc: "公司看板、面试复盘、简历库与 Offer 对比" },
  { id: "todos", title: "待办", to: "/todos", icon: CheckSquare, defaultOn: true, desc: "优先级、截止日期、重复任务与提醒" },
  { id: "calendar", title: "日历", to: "/calendar", icon: CalendarDays, defaultOn: true, desc: "月视图看待办、随记与纪念日" },
  { id: "expenses", title: "记账", to: "/expenses", icon: Wallet, defaultOn: true, desc: "分类汇总、预算与趋势" },
  { id: "notes", title: "随笔记", to: "/notes", icon: StickyNote, defaultOn: true, desc: "模板化速记，可一键升级为文章" },
  { id: "timeline", title: "时间线", to: "/timeline", icon: History, defaultOn: true, desc: "所有动态按日期回看" },
  { id: "report", title: "周报", to: "/report", icon: FileBarChart, defaultOn: true, desc: "一键汇总本周/本月，复制或存入知识库" },
  // —— 模块超市（默认未获取）——
  { id: "fitness", title: "健身", to: "/fitness", icon: Dumbbell, defaultOn: false, desc: "记录每次训练：部位、动作、组数与重量" },
  { id: "habits", title: "习惯打卡", to: "/habits", icon: Sparkles, defaultOn: false, desc: "自定义习惯，一周 7 格点一点" },
  { id: "reading", title: "书影音", to: "/reading", icon: BookMarked, defaultOn: false, desc: "书 / 影 / 剧清单，标记状态与评分" },
  { id: "weight", title: "体重记录", to: "/weight", icon: Scale, defaultOn: false, desc: "每日体重与体脂，趋势一眼看清" },
  { id: "sleep", title: "睡眠打卡", to: "/sleep", icon: BedDouble, defaultOn: false, desc: "记录入睡起床，看本周睡得怎么样" },
  { id: "subs", title: "订阅管理", to: "/subs", icon: CreditCard, defaultOn: false, desc: "会员 / 软件 / 云盘，月花多少钱一目了然" },
  { id: "expiry", title: "过期提醒", to: "/expiry", icon: AlarmClock, defaultOn: false, desc: "调料 / 化妆品 / 药品的到期日，临期倒计时 + 提醒" },
  { id: "accounts", title: "账号管理", to: "/accounts", icon: KeyRound, defaultOn: false, desc: "各平台账号密码集中记，一键复制 + 强度 / 重复检查" },
  { id: "trips", title: "旅行清单", to: "/trips", icon: Plane, defaultOn: false, desc: "行程计划 + 行前待办清单" },
  { id: "recipes", title: "菜谱收藏", to: "/recipes", icon: ChefHat, defaultOn: false, desc: "收藏想做的菜，食材步骤都在" },
  { id: "feedback", title: "反馈看板", to: "/feedback", icon: MessageSquareHeart, defaultOn: false, desc: "作品集的访客留言与访问统计" },
];

export const DEFAULT_ENABLED = MODULES.filter((m) => m.defaultOn).map((m) => m.id);

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
