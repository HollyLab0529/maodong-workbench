import { useEffect, useMemo, useRef, useState } from "react";
import Layout, { PageHeader } from "../components/Layout";
import { listRows, insertRow, updateRow, deleteRow } from "../api";
import { useLiveReload } from "../live";
import { Button, Input, Label, Checkbox, Loading, EmptyState, toast } from "../components/ui";
import { AlarmClock, Plus, Trash2, Bell } from "lucide-react";

const CATEGORIES = ["调料", "化妆品", "药品", "食品", "日用", "其他"];

const CAT_STYLE = {
  调料: "bg-amber-50 text-amber-600",
  化妆品: "bg-pink-50 text-pink-500",
  药品: "bg-sky-50 text-sky-600",
  食品: "bg-emerald-50 text-emerald-600",
  日用: "bg-slate-100 text-slate-500",
  其他: "bg-slate-100 text-slate-500",
};

/** 剩余天数：负数=已过期多少天，0=今天到期 */
function daysLeft(dateStr) {
  if (!dateStr) return null;
  const target = Date.parse(dateStr + "T00:00:00Z");
  if (Number.isNaN(target)) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - todayUtc) / 86400000);
}

function leftLabel(d) {
  if (d === null) return "未填到期日";
  if (d < 0) return `已过期 ${-d} 天`;
  if (d === 0) return "今天到期";
  return `还剩 ${d} 天`;
}

function leftStyle(d) {
  if (d === null) return "bg-slate-100 text-slate-400";
  if (d <= 0) return "bg-red-50 text-red-500";
  if (d <= 7) return "bg-amber-50 text-amber-600";
  if (d <= 30) return "bg-terracotta-50 text-terracotta";
  return "bg-slate-100 text-slate-500";
}

/** 快到期时推浏览器通知，每天每条最多一次 */
function useExpiryReminder(items) {
  const notifiedRef = useRef({});
  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") Notification.requestPermission().catch(() => {});
    const check = () => {
      if (Notification.permission !== "granted") return;
      const dayKey = new Date().toDateString();
      items
        .filter((i) => !i.used)
        .forEach((i) => {
          const d = daysLeft(i.expire_date);
          if (d === null || d > 3) return;
          if (notifiedRef.current[i.id] === dayKey) return;
          notifiedRef.current[i.id] = dayKey;
          try {
            new Notification("猫冬手帐 · 过期提醒", {
              body: `${i.name}${d < 0 ? ` 已过期 ${-d} 天` : d === 0 ? " 今天就到期" : ` 还剩 ${d} 天到期`}`,
              tag: `wb-expiry-${i.id}`,
            });
          } catch {
            /* ignore */
          }
        });
    };
    check();
    const timer = setInterval(check, 60 * 1000);
    return () => clearInterval(timer);
  }, [items]);
}

export default function Expiry() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("调料");
  const [expireDate, setExpireDate] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("在用");

  const load = async () => {
    try {
      setItems(await listRows("expiry_items"));
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);
  useExpiryReminder(items);

  const stats = useMemo(() => {
    const open = items.filter((i) => !i.used);
    let expired = 0, week = 0, month = 0;
    open.forEach((i) => {
      const d = daysLeft(i.expire_date);
      if (d === null) return;
      if (d <= 0) expired += 1;
      else if (d <= 7) week += 1;
      else if (d <= 30) month += 1;
    });
    return { expired, week, month, open: open.length };
  }, [items]);

  const sorted = useMemo(() => {
    const open = items.filter((i) => !i.used);
    const used = items.filter((i) => i.used);
    open.sort((a, b) => String(a.expire_date || "9999-12-31").localeCompare(String(b.expire_date || "9999-12-31")));
    used.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return { open, used };
  }, [items]);

  const shown = useMemo(() => {
    if (filter === "已用掉") return sorted.used;
    if (filter === "已过期") return sorted.open.filter((i) => (daysLeft(i.expire_date) ?? 999) <= 0);
    if (filter === "临期") {
      return sorted.open.filter((i) => {
        const d = daysLeft(i.expire_date);
        return d !== null && d > 0 && d <= 30;
      });
    }
    return sorted.open;
  }, [sorted, filter]);

  const add = async () => {
    if (!name.trim()) return toast.error("先写个物品名");
    setSaving(true);
    try {
      await insertRow("expiry_items", {
        name: name.trim(),
        category,
        expire_date: expireDate,
        note: note.trim(),
        used: false,
      });
      setName("");
      setExpireDate("");
      setNote("");
      toast.success("记下了");
      load();
    } catch (e) {
      toast.error("保存失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleUsed = async (item) => {
    try {
      await updateRow("expiry_items", item.id, { used: !item.used });
      load();
    } catch (e) {
      toast.error("更新失败：" + e.message);
    }
  };

  const remove = async (item) => {
    try {
      await deleteRow("expiry_items", item.id);
      load();
    } catch (e) {
      toast.error("删除失败：" + e.message);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="过期提醒"
        subtitle="调料、化妆品、药品记上到期日，临期自动算倒计时并提醒"
      />

      <div className="max-w-4xl space-y-5 xl:max-w-5xl">
        {/* 统计 */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["已过期", stats.expired, "text-red-500"],
            ["7 天内", stats.week, "text-amber-600"],
            ["30 天内", stats.month, "text-terracotta"],
            ["在用总数", stats.open, "text-slate-700"],
          ].map(([label, val, cls]) => (
            <div key={label} className="rounded-xl border border-slate-200/70 bg-white/80 px-3.5 py-3">
              <p className="text-[11px] text-slate-400">{label}</p>
              <p className={`mt-0.5 text-xl font-semibold ${cls}`}>{val}</p>
            </div>
          ))}
        </div>

        {/* 添加 */}
        <div className="rounded-xl border border-terracotta-100 bg-terracotta-50/40 p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <AlarmClock className="h-4 w-4 text-terracotta" /> 记一件会过期的东西
          </h2>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <div>
                <Label>物品</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="比如：老干妈、防晒霜、维生素"
                  onKeyDown={(e) => e.key === "Enter" && add()}
                />
              </div>
              <div>
                <Label>到期日</Label>
                <Input type="date" value={expireDate} onChange={(e) => setExpireDate(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button onClick={add} loading={saving} className="w-full sm:w-auto">
                  <Plus className="h-4 w-4" /> 添加
                </Button>
              </div>
            </div>
            <div>
              <Label>分类</Label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                      category === c ? "bg-terracotta text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>备注（可选）</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="比如：开封后放冰箱，剩下的分装" />
            </div>
          </div>
        </div>

        {/* 筛选 */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            ["在用", sorted.open.length],
            ["临期", stats.week + stats.month],
            ["已过期", stats.expired],
            ["已用掉", sorted.used.length],
          ].map(([k, n]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                filter === k
                  ? "bg-terracotta text-white"
                  : "bg-white/70 text-slate-500 ring-1 ring-slate-200 hover:text-terracotta"
              }`}
            >
              {k} <span className={filter === k ? "opacity-80" : "text-slate-300"}>{n}</span>
            </button>
          ))}
        </div>

        {/* 列表 */}
        {loading ? (
          <Loading />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={AlarmClock}
            text={filter === "在用" ? "还没有记录。先把家里最容易忘的那瓶调料记上" : `「${filter}」里暂时是空的`}
          />
        ) : (
          <div className="space-y-1.5">
            {shown.map((item) => {
              const d = daysLeft(item.expire_date);
              return (
                <div
                  key={item.id}
                  className="group flex items-center gap-3 rounded-lg border border-slate-100 bg-white/80 px-3.5 py-2.5 transition-shadow hover:shadow-soft"
                >
                  <Checkbox checked={!!item.used} onChange={() => toggleUsed(item)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`truncate text-sm ${item.used ? "text-slate-300 line-through" : "text-slate-700"}`}>
                        {item.name}
                      </span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${CAT_STYLE[item.category] || CAT_STYLE["其他"]}`}>
                        {item.category || "其他"}
                      </span>
                    </div>
                    {item.note ? (
                      <p className="mt-0.5 truncate text-[11px] text-slate-400">{item.note}</p>
                    ) : null}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${item.used ? "bg-slate-100 text-slate-400" : leftStyle(d)}`}>
                    {item.used ? "已用掉" : leftLabel(d)}
                  </span>
                  <span className="hidden shrink-0 text-[11px] text-slate-400 sm:block">{item.expire_date || "—"}</span>
                  <button
                    onClick={() => remove(item)}
                    className="text-slate-200 transition-colors hover:text-red-400 group-hover:text-slate-300"
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <p className="flex items-center gap-1.5 text-[11px] text-slate-300">
          <Bell className="h-3 w-3" /> 剩余 3 天以内（含已过期）会在打开页面时推浏览器通知，每条每天最多提醒一次。
        </p>
      </div>
    </Layout>
  );
}
