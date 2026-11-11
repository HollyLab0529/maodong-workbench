import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { Button } from "../components/ui";
import { ArrowLeft, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "../components/ui";

// 示例里的域名随当前访问地址生成：自己部署到任何域名下都成立
const BASE = typeof window !== "undefined" ? window.location.origin : "";

const ENDPOINTS = [
  ["GET", "/api/v1/me", "当前令牌对应的账号与权限", "read"],
  ["GET", "/api/v1/schema", "全部可用集合与字段（给脚本/AI 自助发现）", "read"],
  ["GET", "/api/v1/summary", "今日概览：待办、本月支出、7 天内自动续费、60 天内纪念日", "read"],
  ["GET", "/api/v1/:coll", "列表，支持 ?limit=50&offset=0&q=关键词&since=2026-01-01T00:00:00Z", "read"],
  ["POST", "/api/v1/:coll", "新增一条记录，body 传集合字段", "write"],
  ["PATCH", "/api/v1/:coll/:id", "更新指定记录", "write"],
  ["DELETE", "/api/v1/:coll/:id", "删除指定记录", "write"],
  ["POST", "/api/v1/capture", "快速捕捉：type = todo / note / expense", "write"],
];

const COLLECTIONS = [
  ["todos", "title, priority, due_date, done, repeat"],
  ["expenses", "amount, category, note, spent_at"],
  ["quick_notes", "ntype, title, tags, content, promoted"],
  ["kb_articles", "title, category, tags, content, updated_at"],
  ["anniversaries", "title, date, repeat, note"],
  ["subs", "name, amount, cycle, next_date, status, auto_renew, remind_days"],
  ["workouts / weights / sleeps / books", "健身、体重、睡眠、书影音（详见 /api/v1/schema）"],
  ["job_apps / interviews / offers / resumes", "求职系列（详见 /api/v1/schema）"],
  ["trips / recipes / habits / habit_logs", "旅行、菜谱、习惯（详见 /api/v1/schema）"],
];

function Code({ children }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      toast.success("已复制");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("复制失败");
    }
  };
  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-50">{children}</pre>
      <button
        onClick={copy}
        className="absolute right-2 top-2 rounded-md bg-white/10 p-1.5 text-slate-300 opacity-0 transition-opacity hover:bg-white/20 hover:text-white group-hover:opacity-100"
        title="复制"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function ApiDoc() {
  return (
    <Layout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">API 文档</h1>
          <p className="mt-1 text-sm text-slate-500">v1 · 让脚本、快捷指令和 AI 读写你的手帐</p>
        </div>
        <Link to="/settings">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-3.5 w-3.5" /> 返回设置
          </Button>
        </Link>
      </div>

      <div className="max-w-2xl space-y-5 xl:max-w-3xl">
        {/* 快速开始 */}
        <section className="rounded-xl border border-slate-200/70 bg-white/80 p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">1. 快速开始</h2>
          <ol className="mb-3 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-slate-600">
            <li>在 <Link to="/settings" className="text-terracotta-600 hover:underline">设置 → API 访问</Link> 创建一枚令牌（明文只显示一次）</li>
            <li>请求带 <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">Authorization: Bearer wb_xxx</code> 头</li>
            <li>所有响应为 JSON；每枚令牌限 120 次/分钟</li>
          </ol>
          <Code>{`# 验证令牌
curl ${BASE}/api/v1/me \\
  -H "Authorization: Bearer wb_xxxx"`}</Code>
        </section>

        {/* 端点 */}
        <section className="rounded-xl border border-slate-200/70 bg-white/80 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">2. 端点一览</h2>
          <div className="space-y-2">
            {ENDPOINTS.map(([method, path, desc, scope]) => (
              <div key={method + path} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${method === "GET" ? "bg-emerald-100 text-emerald-700" : method === "POST" ? "bg-sky-100 text-sky-700" : method === "PATCH" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                  {method}
                </span>
                <code className="font-mono text-xs font-medium text-slate-800">{path}</code>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${scope === "write" ? "bg-terracotta-100 text-terracotta-700" : "bg-slate-200 text-slate-500"}`}>
                  {scope === "write" ? "需读写权限" : "只读即可"}
                </span>
                <span className="w-full text-[11px] text-slate-500 sm:w-auto sm:flex-1">{desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 集合 */}
        <section className="rounded-xl border border-slate-200/70 bg-white/80 p-5">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">3. 可用集合</h2>
          <p className="mb-3 text-xs text-slate-500">把下表第一列替换进路径的 <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">:coll</code>；完整字段以 <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">GET /api/v1/schema</code> 为准。</p>
          <div className="space-y-1.5">
            {COLLECTIONS.map(([coll, fields]) => (
              <div key={coll} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                <code className="font-mono text-xs font-medium text-slate-800">{coll}</code>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{fields}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            邀请码（invites）与系统设置（settings）不在开放 API 白名单内，只能登录后在页面管理。
          </p>
        </section>

        {/* 示例 */}
        <section className="rounded-xl border border-slate-200/70 bg-white/80 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">4. 常用示例</h2>
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-700">加一条待办</p>
              <Code>{`curl -X POST ${BASE}/api/v1/todos \\
  -H "Authorization: Bearer wb_xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"给妈妈打电话","due_date":"2026-11-08","priority":"high"}'`}</Code>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-700">快速捕捉一笔支出（快捷指令最常用）</p>
              <Code>{`curl -X POST ${BASE}/api/v1/capture \\
  -H "Authorization: Bearer wb_xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"expense","amount":35,"category":"餐饮","note":"午饭"}'`}</Code>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-700">搜索待办里的「体检」</p>
              <Code>{`curl "${BASE}/api/v1/todos?q=体检&limit=10" \\
  -H "Authorization: Bearer wb_xxxx"`}</Code>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-700">把待办标记完成</p>
              <Code>{`curl -X PATCH ${BASE}/api/v1/todos/42 \\
  -H "Authorization: Bearer wb_xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"done":true}'`}</Code>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-700">今日概览（适合每日推送 / 桌面小组件）</p>
              <Code>{`curl ${BASE}/api/v1/summary \\
  -H "Authorization: Bearer wb_xxxx"`}</Code>
              <p className="mt-1.5 text-[11px] text-slate-400">
                返回示例：{"{"}"todos":{"{"}"open":2,"due_today":1{"}"},"expenses":{"{"}"month_total":128.5,"month_count":9{"}"},"subs_renew_soon":[…],"anniversaries_soon":[…],…{"}"}
              </p>
            </div>
          </div>
        </section>

        {/* 安全说明 */}
        <section className="rounded-xl border border-slate-200/70 bg-white/80 p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">5. 安全约定</h2>
          <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-600">
            <li>令牌只存哈希（sha256），服务器也找不回明文；丢了就吊销重建</li>
            <li>「只读」令牌无法新增/修改/删除任何数据</li>
            <li>数据按账号隔离，令牌只能访问创建它的那个账号的数据</li>
            <li>被吊销的令牌立即失效；列表里随时能看到每枚令牌的最近使用时间</li>
            <li>限流 120 次/分钟/令牌，超限返回 429 与 Retry-After 头</li>
          </ul>
        </section>
      </div>
    </Layout>
  );
}
