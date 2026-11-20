#!/usr/bin/env node
/**
 * 演示站数据种子：造一套纯虚构的样例，让「今天 / 本包 / 跟进 / 全量」四个工作区、
 * 简历库、面试复盘、日历、首页都有内容可看——作品集里的演示站靠它撑场面。
 *
 *   DEMO_MODE=1 DATA_DIR=/opt/workbench-demo/data node scripts/seed_demo.js --dry-run
 *   DEMO_MODE=1 DATA_DIR=/opt/workbench-demo/data node scripts/seed_demo.js
 *
 * 纪律：
 *   - 只动内容集合，保留 users / invites / 登录态，不会把演示账号弄丢。
 *   - 公司、人、简历、进展全部虚构；日期用「相对今天」算，什么时候跑都是新鲜的。
 *   - 真站数据目录会被拒绝写入（除非显式 --force），避免手滑把真实求职记录覆盖成样例。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const DRY = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const DEMO = process.env.DEMO_MODE === "1";

if (!DEMO && !FORCE) {
  console.error("❌ 这不是演示实例（DEMO_MODE 不是 1）。");
  console.error("   如果是真站数据，请立刻停下；确实要重置演示库请加 --force。");
  process.exit(1);
}
if (!fs.existsSync(DB_FILE)) {
  console.error(`❌ 找不到 ${DB_FILE}。先启动一次服务让它初始化，或检查 DATA_DIR。`);
  process.exit(1);
}

// ---------- 日期工具：全部相对今天，样例永远不会「过期」 ----------
const pad = (n) => String(n).padStart(2, "0");
const day = (off = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const ts = (off = 0, hour = 10, min = 20) => {
  const d = new Date();
  d.setDate(d.getDate() + off);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
};
const today = day(0);
const thisMonth = today.slice(0, 7);

// ---------- 岗位：覆盖四个工作区的每种处境 ----------
// 全部虚构公司名。字段照 v2 模型填全，这样筛选、漏斗、新岗判断都有东西可看。
const jobs = [
  // 今天这一包：3 条待投 + 2 条今天已投（本包进度 2/5）
  { company: "云栖智能", position: "AI 应用产品经理（实习）", city: "北京", company_type: "中小厂", source: "官网", tier: "冲刺", status: "待投递", plan_date: today, publish_date: day(-1), resume_id: 1, link: "https://example.com/jobs/cloudnest-ai-pm", note: "做智能客服方向，JD 里点名要会写评测集" },
  { company: "木鱼科技", position: "产品经理（2027 届校招）", city: "北京", company_type: "中小厂", source: "BOSS直聊", tier: "主力", status: "待投递", plan_date: today, publish_date: day(-3), resume_id: 1, link: "https://example.com/jobs/muyu-pm" },
  { company: "蓝鲸数据", position: "数据产品经理", city: "天津", company_type: "中小厂", source: "牛客", tier: "保底", status: "待投递", plan_date: today, publish_date: day(-6), resume_id: 2, link: "https://example.com/jobs/bluewhale-dpm" },
  { company: "拾光文创", position: "产品运营（实习）", city: "上海", company_type: "其他", source: "实习僧", tier: "主力", status: "简历筛选中", applied_date: today, plan_date: today, publish_date: day(-2), resume_id: 3, link: "https://example.com/jobs/shiguang-ops" },
  { company: "北岸医疗", position: "医疗信息化产品经理", city: "北京", company_type: "中小厂", source: "官网", tier: "保底", status: "简历筛选中", applied_date: today, plan_date: today, publish_date: day(-5), link: "https://example.com/jobs/northbay-pm" },

  // 逾期没投：计划日期过了还没投，跟进页和日历都会点出来
  { company: "三叶草教育", position: "教育产品经理", city: "天津", company_type: "其他", source: "BOSS直聊", tier: "保底", status: "待投递", plan_date: day(-2), publish_date: day(-10), link: "https://example.com/jobs/clover-pm" },
  { company: "橙记网络", position: "社区产品经理", city: "上海", company_type: "中小厂", source: "内推", tier: "主力", status: "待投递", plan_date: day(-3), publish_date: day(-9), link: "https://example.com/jobs/orange-note-pm" },

  // 投了没动静：9 / 16 / 22 天，跟进页三个档位都有
  { company: "麓山智造", position: "工业软件产品经理", city: "北京", company_type: "中小厂", source: "内推", tier: "主力", status: "简历筛选中", applied_date: day(-9), status_changed_at: day(-9), publish_date: day(-20), resume_id: 1, link: "https://example.com/jobs/lushan-pm", note: "内推人说是用人部门直招，流程会比官网快" },
  { company: "清禾金融", position: "金融产品经理", city: "北京", company_type: "中小厂", source: "官网", tier: "主力", status: "测评中", applied_date: day(-16), status_changed_at: day(-14), publish_date: day(-26), resume_id: 2, link: "https://example.com/jobs/qinghe-pm", note: "测评链接 48 小时内有效，拖到最后一天才做" },
  { company: "星图出行", position: "出行产品经理", city: "上海", company_type: "中小厂", source: "BOSS直聊", tier: "冲刺", status: "简历筛选中", applied_date: day(-22), status_changed_at: day(-22), publish_date: day(-30), link: "https://example.com/jobs/startrip-pm", next_action: "问 HR 还有没有在推进", next_action_date: day(-1) },

  // 流程中：一条卡了 16 天（卡住的），一条今天该准备
  { company: "和光能源", position: "能源数字化产品经理", city: "北京", company_type: "中小厂", source: "官网", tier: "冲刺", status: "二面中", applied_date: day(-18), status_changed_at: day(-16), publish_date: day(-27), resume_id: 1, link: "https://example.com/jobs/heguang-pm", note: "二面是业务负责人，问了很多数据口径" },
  { company: "南山云仓", position: "供应链产品经理", city: "天津", company_type: "中小厂", source: "牛客", tier: "主力", status: "一面中", applied_date: day(-12), status_changed_at: day(-6), publish_date: day(-21), resume_id: 3, link: "https://example.com/jobs/nanshan-pm", next_action: "整理一面的追问清单", next_action_date: today },

  // 结束：一条拿到意向（绿色），一条自己取消
  { company: "溪谷生物", position: "产品经理（校招）", city: "北京", company_type: "其他", source: "官网", tier: "保底", status: "Offer", applied_date: day(-30), status_changed_at: day(-4), publish_date: day(-40), resume_id: 1, link: "https://example.com/jobs/xigu-bio-pm", note: "小团队的意向书，后续还要谈实习转正" },
  { company: "明瓦咨询", position: "咨询顾问（数字化方向）", city: "上海", company_type: "其他", source: "BOSS直聊", tier: "保底", status: "已取消", applied_date: day(-35), status_changed_at: day(-25), rejected_at: day(-25), publish_date: day(-45), link: "https://example.com/jobs/mingwa-consultant", note: "初面后判断方向不合，主动不跟了" },
];
// 统一补批次：今天这一包 vs 更早的包
const batchOf = (j) => {
  if (j.plan_date === today || j.applied_date === today) return { batch: `包-${today}`, batch_date: today };
  if (j.plan_date) return { batch: `包-${j.plan_date}`, batch_date: j.plan_date };
  return { batch: `包-${String(j.applied_date || today).slice(0, 10)}`, batch_date: String(j.applied_date || today).slice(0, 10) };
};

// ---------- 简历：4 份，其中 1 份「仅文本版」、1 份落在按天归档文件夹 ----------
const resumes = [
  { name: "AI 产品经理-通用版", target_role: "AI 应用产品经理", folder: "通用版", in_use: 1, file_url: "", file_size: 0, content: "# 简历正文（演示）\n\n这段是纯文本版简历，演示站没有真实 PDF。", note: "主投版本，重点写评测与数据闭环" },
  { name: "数据分析-定向版", target_role: "数据产品经理", folder: "通用版", in_use: 0, file_url: "", file_size: 0, content: "# 简历正文（演示）\n\n偏数据方向的定向版本。", note: "投数据岗时换这份" },
  { name: "产品运营-精修版", target_role: "产品运营", folder: "通用版", in_use: 0, file_url: "", file_size: 0, content: "# 简历正文（演示）\n\n运营向，强调社群与内容。", note: "" },
  { name: "投递存档-1120", target_role: "AI 应用产品经理", folder: `投递-${day(-2)}`, in_use: 0, file_url: "", file_size: 0, content: "# 简历正文（演示）\n\n按天归档的历史版本。", note: "按天归档的示例，默认折叠" },
];

// ---------- 面试复盘：一条通过（触发状态回写）、一条等消息、一条零题草稿 ----------
const interviews = [
  { app_id: 11, company: "和光能源", round: "二面", interview_date: day(-16), interviewers: "业务负责人 + HR", result: "通过", rating: 4, status_sync: "1", questions: JSON.stringify([{ q: "你们的评测集是怎么定口径的？", a: "先说指标定义，再说样本怎么分层，最后说怎么防止刷分。", tag: "专业" }, { q: "如果业务方不认你的数据，怎么办？", a: "拉一次对齐会，把口径写在文档里让双方签字。", tag: "协作" }]), summary: "问题集中在数据口径和跨部门协作。复盘：讲评测时先给结论，再补过程。" },
  { app_id: 9, company: "清禾金融", round: "一面", interview_date: day(-14), interviewers: "产品经理", result: "等消息", rating: 3, status_sync: "0", questions: JSON.stringify([{ q: "为什么想做金融方向？", a: "答得偏虚，应该举一个自己研究过的产品例子。", tag: "动机" }]), summary: "整体节奏偏快，动机题答得不好，下次准备一个具体案例。" },
  { app_id: 10, company: "星图出行", round: "一面", interview_date: day(-20), interviewers: "", result: "", rating: 0, status_sync: "0", questions: "[]", summary: "" },
];

// ---------- 进展事件：带上一条含链接的备注，演示自动识别 ----------
const events = [
  { app_id: 8, title: "内推人已把简历推给用人部门", event_date: day(-9), note: "内推码走的是内部系统，官网那份不用重复投" },
  { app_id: 9, title: "收到测评链接", event_date: day(-14), note: "48 小时内有效，做题入口 https://example.com/assess/qinghe" },
  { app_id: 10, title: "投递后一直没有回音", event_date: day(-22), note: "第 7 天问过一次，说在走流程" },
  { app_id: 11, title: "一面通过，约二面", event_date: day(-16), note: "二面安排在周四下午" },
  { app_id: 11, title: "二面结束，反馈不错", event_date: day(-15), note: "对方说本周给结论" },
  { app_id: 12, title: "约一面", event_date: day(-6), note: "面试官是供应链负责人" },
  { app_id: 13, title: "收到意向书", event_date: day(-4), note: "先口头沟通了实习转正的条件" },
  { app_id: 14, title: "主动放弃", event_date: day(-25), note: "方向不合，跟 HR 说明了原因" },
];

const todos = [
  { title: "云栖智能 · AI 应用产品经理 投出去", notes: "来自求职看板 #1", priority: "high", due_date: today, done: false },
  { title: "整理南山云仓一面的追问清单", notes: "来自求职看板 #12", priority: "high", due_date: today, done: false },
  { title: "问星图出行 HR 还有没有在推进", notes: "来自求职看板 #10", priority: "medium", due_date: day(-1), done: false },
  { title: "把三叶草教育的投递补上", notes: "来自求职看板 #6", priority: "high", due_date: day(-2), done: false },
  { title: "复盘和光能源二面的两个问题", notes: "面试复盘里已经记了一半", priority: "medium", due_date: day(1), done: false },
  { title: "更新作品集的工作台案例页", notes: "", priority: "low", due_date: day(-3), done: true },
];

const expenses = [
  { amount: 24, category: "餐饮", note: "面试路上买的咖啡", spent_at: day(0) },
  { amount: 168, category: "交通", note: "去北京面试的高铁", spent_at: day(-2) },
  { amount: 59, category: "订阅", note: "简历模板会员", spent_at: day(-5) },
  { amount: 32, category: "餐饮", note: "和同学吃饭", spent_at: day(-7) },
  { amount: 199, category: "学习", note: "一本产品相关的书", spent_at: day(-12) },
];

const kb_articles = [
  { title: "怎么给一个 AI 功能定可观测的验收标准", category: "方法", tags: "AI,评测", content: "先定指标和口径，再定样本分层，最后定「什么算通过」。没有这一步，迭代就是凭感觉。", updated_at: ts(-3) },
  { title: "批量导入为什么要先预检", category: "技术", tags: "工程,导入", content: "导入的失败几乎都发生在规模化那一步。预检把「能不能导」和「导得对不对」分开，错误在写库前就暴露。", updated_at: ts(-9) },
  { title: "求职看板的口径笔记", category: "方法", tags: "求职", content: "在池岗位、本包进度、逾期三个数必须能人工核对上，否则看板就是在骗自己。", updated_at: ts(-1) },
];

const quick_notes = [
  { ntype: "note", title: "投递节奏", tags: "求职", content: "一天最多排 5 家，超过就质量下降。宁可少投，也别把同一份简历到处扔。", promoted: false },
  { ntype: "note", title: "作品集更新日志", tags: "作品集", content: "把看板的四个工作区写成案例，重点讲「为什么原来的漏斗不好用」。", promoted: false },
];

const anniversaries = [
  { title: "开始做猫冬手帐", date: day(-100).slice(5), repeat: "year", note: "第一版只有待办和记账" },
];

const subs = [
  { name: "云服务器", amount: 60, cycle: "month", next_date: day(3), status: "active", note: "演示站和作品集都跑在这台", auto_renew: "1", remind_days: 3 },
  { name: "域名", amount: 85, cycle: "year", next_date: day(20), status: "active", note: "", auto_renew: "1", remind_days: 7 },
];

// 状态配置：默认十档 + 分组 + 简写；策略里放一条虚构公司的红线，演示二次确认
const statuses = [
  ["待投递", "teal", "todo", "待"], ["简历筛选中", "blue", "applied", "筛"], ["测评中", "indigo", "applied", "测"],
  ["笔试中", "purple", "progress", "笔"], ["一面中", "amber", "progress", "一"], ["二面中", "orange", "progress", "二"],
  ["三面中", "rose", "progress", "三"], ["HR面中", "pink", "progress", "HR"], ["Offer", "green", "closed", "录"],
  ["已取消", "slate", "closed", "×"],
].map(([name, tone, group, short]) => ({ name, tone, group, short }));

const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
const keep = {
  users: db.users || [],
  invites: db.invites || [],
  templates: db.templates,
  modules: db.modules,
};

// 统一写入：清空内容集合后按顺序灌入，id 从 1 开始，user_id 一律挂演示账号
const nextDb = {
  ...db,
  ...keep,
  job_apps: jobs.map((j, i) => ({ id: i + 1, user_id: 1, ...batchOf(j), ...j, updated_at: ts(-(i % 7), 9, 30), created_at: ts(-(20 - i), 9, 20), _migrated: "v2" })),
  job_events: events.map((e, i) => ({ id: i + 1, user_id: 1, ...e, created_at: ts(-(15 - i), 18, 0) })),
  resumes: resumes.map((r, i) => ({ id: i + 1, user_id: 1, ...r, created_at: ts(-(25 - i), 11, 0), updated_at: ts(-(3 - i), 11, 0) })),
  interviews: interviews.map((v, i) => ({ id: i + 1, user_id: 1, ...v, created_at: ts(-(14 - i), 20, 0) })),
  todos: todos.map((t, i) => ({ id: i + 1, user_id: 1, ...t, created_at: ts(-(6 - i), 8, 0) })),
  expenses: expenses.map((e, i) => ({ id: i + 1, user_id: 1, ...e })),
  kb_articles: kb_articles.map((a, i) => ({ id: i + 1, user_id: 1, ...a })),
  quick_notes: quick_notes.map((n, i) => ({ id: i + 1, user_id: 1, ...n, created_at: ts(-(5 - i), 21, 0) })),
  note_tags: ["求职", "作品集", "方法"].map((name, i) => ({ id: i + 1, user_id: 1, name, sort: i })),
  anniversaries: anniversaries.map((a, i) => ({ id: i + 1, user_id: 1, ...a })),
  subs: subs.map((s, i) => ({ id: i + 1, user_id: 1, ...s })),
  // 空集合也显式置空，避免旧演示数据残留
  ideas: [], offers: [], workout: [], workouts: [], habits: [], habit_logs: [], books: [],
  weights: [], sleeps: [], trips: [], wishes: [], recipes: [], expiry_items: [], accounts: [],
  settings: [
    { id: 1, user_id: 1, key: "job_statuses", value: JSON.stringify(statuses) },
    { id: 2, user_id: 1, key: "job_policy", value: JSON.stringify({ daily_limit: 5, big_limit: 2, blacklist: ["明瓦咨询"] }) },
  ],
  _seq: {
    job_apps: jobs.length, job_events: events.length, resumes: resumes.length, interviews: interviews.length,
    todos: todos.length, expenses: expenses.length, kb_articles: kb_articles.length, quick_notes: quick_notes.length,
    note_tags: 3, anniversaries: anniversaries.length, subs: subs.length, settings: 2, users: (db.users || []).length,
    invites: (db.invites || []).length,
  },
};

const stat = {
  job_apps: nextDb.job_apps.length,
  job_events: nextDb.job_events.length,
  resumes: nextDb.resumes.length,
  interviews: nextDb.interviews.length,
  todos: nextDb.todos.length,
  本包待投: nextDb.job_apps.filter((j) => j.batch_date === today && !j.applied_date).length,
  本包已投: nextDb.job_apps.filter((j) => j.batch_date === today && j.applied_date).length,
  逾期: nextDb.job_apps.filter((j) => j.status === "待投递" && j.plan_date && j.plan_date < today).length,
};

if (DRY) {
  console.log(`--dry-run：目标是 ${DB_FILE}`);
  console.log("   将写入：", JSON.stringify(stat, null, 0));
  console.log("   保留：users / invites");
  process.exit(0);
}

// 写前先留一份快照，手滑了还能回
const BACKUP_DIR = path.join(DATA_DIR, "backups");
fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backupFile = path.join(BACKUP_DIR, `db.before-seed-${stamp}.json`);
fs.copyFileSync(DB_FILE, backupFile);

const tmp = `${DB_FILE}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(nextDb, null, 2), "utf8");
fs.renameSync(tmp, DB_FILE);

console.log(`✅ 演示数据已写入 ${DB_FILE}`);
console.log("   内容：", JSON.stringify(stat, null, 0));
console.log(`   写入前快照：${backupFile}`);
console.log("   下一步：systemctl restart workbench-demo（服务把 db 常驻在内存，不重启读不到新数据）");
