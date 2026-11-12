import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout, { PageHeader } from "../components/Layout";
import { api } from "../api";
import { useLiveReload } from "../live";
import { Button, EmptyState, Loading, toast } from "../components/ui";
import {
  MessageSquareHeart,
  RefreshCw,
  Eye,
  Users,
  ExternalLink,
  Copy,
  WifiOff,
  Settings2,
} from "lucide-react";

function barChart(daily) {
  if (!daily || daily.length === 0) return null;
  // 补齐 14 天
  const days = [];
  const base = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const map = Object.fromEntries(daily.map((x) => [String(x.d).slice(0, 10), x.c]));
  const vals = days.map((d) => map[d] || 0);
  const max = Math.max(1, ...vals);
  return { days: days.map((d) => d.slice(5)), vals, max };
}

// 作品集站点地址（可选）：构建时用 VITE_SITE_BASE 注入，未配置则不显示「打开页面」链接
const SITE_BASE =
  (typeof window !== "undefined" && window.SITE_BASE) || import.meta.env.VITE_SITE_BASE || "";

export default function Feedback() {
  const [data, setData] = useState(null); // {ok, reason, stats, items, count}
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setData(await api.feedbackOverview());
    } catch (e) {
      setData({ ok: false, reason: "error", error: e.message });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  const chart = useMemo(() => (data?.ok ? barChart(data.stats?.daily) : null), [data]);
  const pages = useMemo(
    () => (data?.ok ? (data.stats?.pages || []).slice(0, 5) : []),
    [data]
  );

  const copyContact = async (c) => {
    try {
      await navigator.clipboard.writeText(c);
      toast.success("联系方式已复制");
    } catch {
      toast.error("复制失败，请手动选中");
    }
  };

  return (
    <Layout>
      <PageHeader
        title="反馈看板"
        subtitle="作品集的访客留言与访问情况，数据来自同机的反馈服务"
        action={<Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /> 刷新</Button>}
      />

      {loading ? (
        <Loading />
      ) : !data?.ok ? (
        <div className="max-w-2xl">
          <div className="rounded-xl border border-slate-200/70 bg-white/80 p-6">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-800">
              {data?.reason === "unconfigured" ? <Settings2 className="h-4 w-4 text-terracotta" /> : <WifiOff className="h-4 w-4 text-terracotta" />}
              {data?.reason === "unconfigured" ? "还没连接反馈服务" : "反馈服务暂时连不上"}
            </p>
            <p className="text-xs leading-relaxed text-slate-500">
              {data?.reason === "unconfigured"
                ? "需要在服务器上放一枚反馈看板的管理令牌（/opt/workbench/data/.feedback-token），工作台就能替你拉取数据——令牌不会暴露给浏览器。"
                : `连接 http://127.0.0.1:8710 失败：${data?.error || "未知错误"}。检查 feedback 服务是否在运行。`}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* 统计卡 */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { icon: MessageSquareHeart, label: "反馈总数", value: data.count },
              { icon: Eye, label: "今日浏览", value: data.stats?.pv_today ?? 0 },
              { icon: Users, label: "今日访客", value: data.stats?.uv_today ?? 0 },
              { icon: Eye, label: "累计浏览", value: data.stats?.pv_total ?? 0 },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-xl border border-slate-200/70 bg-white/80 p-4 text-center">
                <Icon className="mx-auto mb-1 h-4 w-4 text-terracotta" />
                <p className="text-xl font-semibold text-slate-900">{value}</p>
                <p className="text-[11px] text-slate-400">{label}</p>
              </div>
            ))}
          </div>

          {/* 14 天浏览趋势 */}
          {chart ? (
            <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4">
              <p className="mb-2 text-xs text-slate-400">近 14 天浏览量</p>
              <div className="flex h-24 items-end gap-1">
                {chart.vals.map((v, i) => (
                  <div key={i} className="group flex flex-1 flex-col items-center gap-1">
                    <span className="text-[9px] text-slate-300 opacity-0 transition-opacity group-hover:opacity-100">{v}</span>
                    <div
                      className="w-full rounded-t bg-terracotta transition-all"
                      style={{ height: `${Math.max(3, (v / chart.max) * 60)}px`, opacity: v ? 1 : 0.15 }}
                      title={`${chart.days[i]}：${v} 次`}
                    />
                    <span className="text-[9px] text-slate-300">{chart.days[i]}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 热门页面 */}
          {pages.length > 0 ? (
            <div className="rounded-xl border border-slate-200/70 bg-white/80 p-4">
              <p className="mb-2 text-xs text-slate-400">最受欢迎的页面</p>
              <div className="space-y-1.5">
                {pages.map((p) => (
                  <div key={p.path} className="flex items-center gap-2 text-xs">
                    <code className="min-w-0 flex-1 truncate rounded bg-slate-50 px-2 py-1 font-mono text-slate-600">{p.path}</code>
                    <span className="shrink-0 text-slate-400">{p.c} 次浏览 · {p.u} 人</span>
                    {SITE_BASE ? (
                      <a
                        href={`${SITE_BASE}${p.path}`}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-slate-300 transition-colors hover:text-terracotta-600"
                        title="打开页面"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 反馈列表 */}
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-900">访客反馈</h2>
            {data.items.length === 0 ? (
              <EmptyState icon={MessageSquareHeart} text="还没有收到反馈" />
            ) : (
              <div className="space-y-2">
                {data.items.map((it) => (
                  <div key={it.id} className="rounded-xl border border-slate-200/70 bg-white/80 p-4">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5">#{it.id}</span>
                      <span>{String(it.created_at || "").slice(0, 16)}</span>
                      {it.page ? (
                        <Link to="/notes" className="rounded-full bg-terracotta-50 px-2 py-0.5 text-terracotta-600">
                          来自 {it.page}
                        </Link>
                      ) : null}
                      {it.contact ? (
                        <button
                          onClick={() => copyContact(it.contact)}
                          className="flex items-center gap-0.5 text-terracotta-600 hover:underline"
                        >
                          <Copy className="h-2.5 w-2.5" /> {it.contact}
                        </button>
                      ) : null}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{it.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
