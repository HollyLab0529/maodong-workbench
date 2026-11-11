import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout, { PageHeader } from "../components/Layout";
import { listRows, insertRow, updateRow, deleteRow, api } from "../api";
import { useAuth } from "../auth";
import { useLiveReload } from "../live";
import { Button, Input, Textarea, Label, EmptyState, Loading, toast } from "../components/ui";
import { Lightbulb, Trash2, ArrowLeft, Send } from "lucide-react";

const STATUS = [
  { key: "待评估", cls: "bg-slate-100 text-slate-500", dot: "bg-slate-300" },
  { key: "规划中", cls: "bg-amber-50 text-amber-600", dot: "bg-amber-400" },
  { key: "已上线", cls: "bg-emerald-50 text-emerald-600", dot: "bg-emerald-400" },
  { key: "暂不考虑", cls: "bg-slate-100 text-slate-400", dot: "bg-slate-200" },
];
const statusOf = (s) => STATUS.find((x) => x.key === s) || STATUS[0];

function fmtDate(iso) {
  const d = String(iso || "").slice(0, 10);
  return d || "";
}

export default function Ideas() {
  const { user } = useAuth();
  const isOwner = !!user?.is_owner;
  const [rows, setRows] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [scope, setScope] = useState(user?.is_owner ? "all" : "mine");
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("全部");

  const load = async () => {
    try {
      const list = await listRows("ideas");
      list.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
      setRows(list);
      if (isOwner) {
        try {
          const { rows: every } = await api.ideasAll();
          setAllRows(every || []);
        } catch {
          /* 非创作者或被拒时静默 */
        }
      }
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  const current = scope === "all" ? allRows : rows;

  const counts = useMemo(() => {
    const c = { 全部: current.length };
    STATUS.forEach((s) => (c[s.key] = current.filter((r) => (r.status || "待评估") === s.key).length));
    return c;
  }, [current]);

  const shown = useMemo(
    () => (filter === "全部" ? current : current.filter((r) => (r.status || "待评估") === filter)),
    [current, filter]
  );

  const submit = async () => {
    const t = title.trim();
    if (!t) return toast.error("先说一句想法是什么");
    setSaving(true);
    try {
      await insertRow("ideas", { title: t, detail: detail.trim(), status: "待评估" });
      setTitle("");
      setDetail("");
      toast.success("记下了");
      load();
    } catch (e) {
      toast.error("保存失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (row, status) => {
    if ((row.status || "待评估") === status) return;
    try {
      if (isOwner) await api.ideasPatch(row.id, { status });
      else await updateRow("ideas", row.id, { status });
      load();
    } catch (e) {
      toast.error("更新失败：" + e.message);
    }
  };

  const remove = async (row) => {
    try {
      if (isOwner) await api.ideasDelete(row.id);
      else await deleteRow("ideas", row.id);
      load();
    } catch (e) {
      toast.error("删除失败：" + e.message);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="我的灵感"
        subtitle="想要什么模块、哪里用着不顺手，先丢进来，再一条条跟到上线"
        action={
          <Link
            to="/store"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-terracotta-300 hover:text-terracotta"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> 回模块超市
          </Link>
        }
      />

      <div className="max-w-4xl space-y-5 xl:max-w-5xl">
        {/* 写一条 */}
        <div className="rounded-xl border border-terracotta-100 bg-terracotta-50/40 p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Lightbulb className="h-4 w-4 text-terracotta" /> 想到一条就写一条
          </h2>
          <div className="space-y-3">
            <div>
              <Label>想法一句话</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="比如：过期提醒"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>
            <div>
              <Label>具体想要什么（可选，越具体越好落地）</Label>
              <Textarea
                rows={3}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="比如：买了调料/化妆品会有对应的过期时间，希望到那天能提醒，并且能看到还剩几天的倒计时，方便管理囤货"
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-400">状态默认「待评估」，之后可以自己改成规划中 / 已上线。</p>
              <Button onClick={submit} loading={saving}>
                <Send className="h-4 w-4" /> 记下来
              </Button>
            </div>
          </div>
        </div>

        {/* 创作者：可切换看全部用户的灵感 */}
        {isOwner ? (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/70 bg-white/70 p-1.5">
            {[
              ["all", `所有人的灵感 ${allRows.length}`],
              ["mine", `只看我的 ${rows.length}`],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setScope(k)}
                className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                  scope === k ? "bg-terracotta text-white" : "text-slate-500 hover:bg-slate-50 hover:text-terracotta"
                }`}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto pr-1 text-[11px] text-slate-400">你是创作者：能看到所有人提交的灵感</span>
          </div>
        ) : null}

        {/* 状态筛选 */}
        <div className="flex flex-wrap items-center gap-1.5">
          {["全部", ...STATUS.map((s) => s.key)].map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                filter === k
                  ? "bg-terracotta text-white"
                  : "bg-white/70 text-slate-500 ring-1 ring-slate-200 hover:text-terracotta"
              }`}
            >
              {k} <span className={filter === k ? "opacity-80" : "text-slate-300"}>{counts[k] || 0}</span>
            </button>
          ))}
        </div>

        {/* 列表 */}
        {loading ? (
          <Loading />
        ) : current.length === 0 ? (
          <EmptyState icon={Lightbulb} text="灵感池还空着。上面写一条试试——比如那个「过期提醒」" />
        ) : shown.length === 0 ? (
          <EmptyState icon={Lightbulb} text={`「${filter}」里暂时没有条目`} />
        ) : (
          <div className="space-y-2">
            {shown.map((r) => {
              const st = statusOf(r.status);
              return (
                <div key={r.id} className="group rounded-xl border border-slate-200/70 bg-white/80 p-4">
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] ${st.cls}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                      {st.key}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{r.title}</p>
                      {r.detail ? (
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-500">{r.detail}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {STATUS.map((s) => (
                          <button
                            key={s.key}
                            onClick={() => setStatus(r, s.key)}
                            className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                              st.key === s.key
                                ? "bg-terracotta text-white"
                                : "bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            }`}
                          >
                            {s.key}
                          </button>
                        ))}
                        {scope === "all" && r.author_email ? (
                          <span className="ml-1 rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500" title={r.author_email}>
                            来自 {r.author_nickname || r.author_email}
                          </span>
                        ) : null}
                        <span className="ml-1 text-[10px] text-slate-300">{fmtDate(r.created_at)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => remove(r)}
                      className="text-slate-200 transition-colors hover:text-red-400 group-hover:text-slate-300"
                      title="删掉这条"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
