import { useEffect, useMemo, useState } from "react";
import Layout, { PageHeader } from "../components/Layout";
import { listRows, insertRow, updateRow, deleteRow } from "../api";
import { useLiveReload } from "../live";
import { Button, Input, Label, Modal, Loading, EmptyState, toast } from "../components/ui";
import { KeyRound, Plus, Trash2, Pencil, Copy, Eye, EyeOff, RefreshCw, Search, ShieldAlert, Link2 } from "lucide-react";

const CATEGORIES = ["社交", "工具", "购物", "工作", "金融", "娱乐", "其他"];

// 分类配色：列表徽标、左侧色条、筛选 chips 统一
const CAT_TINT = {
  社交: { chip: "border-sky-200 bg-sky-50 text-sky-700", edge: "border-l-sky-400" },
  工具: { chip: "border-emerald-200 bg-emerald-50 text-emerald-700", edge: "border-l-emerald-400" },
  购物: { chip: "border-amber-200 bg-amber-50 text-amber-700", edge: "border-l-amber-400" },
  工作: { chip: "border-indigo-200 bg-indigo-50 text-indigo-700", edge: "border-l-indigo-400" },
  金融: { chip: "border-rose-200 bg-rose-50 text-rose-700", edge: "border-l-rose-400" },
  娱乐: { chip: "border-violet-200 bg-violet-50 text-violet-700", edge: "border-l-violet-400" },
  其他: { chip: "border-slate-200 bg-slate-100 text-slate-500", edge: "border-l-slate-300" },
};
const tintOf = (c) => CAT_TINT[c] || CAT_TINT.其他;

const EMPTY = { platform: "", account: "", password: "", category: "工具", url: "", note: "" };

/** 密码强度：长度 + 字符种类，够用就好，不做过度评判 */
function strengthOf(pw) {
  const s = String(pw || "");
  if (!s) return { label: "未设置", cls: "bg-slate-100 text-slate-400" };
  let score = 0;
  if (s.length >= 8) score += 1;
  if (s.length >= 12) score += 1;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) score += 1;
  if (/\d/.test(s)) score += 1;
  if (/[^A-Za-z0-9]/.test(s)) score += 1;
  if (score <= 2) return { label: "偏弱", cls: "bg-red-50 text-red-500" };
  if (score <= 3) return { label: "中等", cls: "bg-amber-50 text-amber-600" };
  return { label: "较强", cls: "bg-emerald-50 text-emerald-600" };
}

/** 生成随机强密码（本地生成，不经过服务器） */
function genPassword(len = 16) {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_";
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
}

const mask = (pw) => "•".repeat(Math.min(14, Math.max(6, String(pw || "").length || 8)));

async function copy(text, label = "已复制") {
  if (!text) return toast.error("这里是空的");
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("浏览器不允许访问剪贴板，请手动选中复制");
  }
}

export default function Accounts() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [filter, setFilter] = useState("全部");
  const [kw, setKw] = useState("");

  // 新增表单
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  // 编辑弹窗
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(EMPTY);
  const [draftShow, setDraftShow] = useState(true);

  const load = async () => {
    try {
      setRows(await listRows("accounts"));
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useLiveReload(load);

  // 同一密码被几个账号重复使用
  const reuse = useMemo(() => {
    const map = {};
    rows.forEach((r) => {
      const p = String(r.password || "").trim();
      if (!p) return;
      map[p] = (map[p] || 0) + 1;
    });
    return map;
  }, [rows]);

  const stats = useMemo(() => {
    const cats = new Set(rows.map((r) => r.category || "其他"));
    const weak = rows.filter((r) => strengthOf(r.password).label === "偏弱").length;
    const dup = Object.values(reuse).filter((n) => n > 1).reduce((a, b) => a + b, 0);
    return { total: rows.length, cats: cats.size, weak, dup };
  }, [rows, reuse]);

  const shown = useMemo(() => {
    const q = kw.trim().toLowerCase();
    return rows
      .filter((r) => (filter === "全部" ? true : (r.category || "其他") === filter))
      .filter((r) =>
        !q
          ? true
          : [r.platform, r.account, r.url, r.note].some((v) => String(v || "").toLowerCase().includes(q))
      )
      .sort((a, b) => String(a.platform || "").localeCompare(String(b.platform || ""), "zh-CN"));
  }, [rows, filter, kw]);

  const add = async () => {
    if (!form.platform.trim()) return toast.error("先填平台名");
    if (!form.account.trim()) return toast.error("账号不能为空");
    setSaving(true);
    try {
      await insertRow("accounts", {
        platform: form.platform.trim(),
        account: form.account.trim(),
        password: form.password,
        category: form.category,
        url: form.url.trim(),
        note: form.note.trim(),
      });
      setForm({ ...EMPTY, category: form.category });
      toast.success("记下了");
      load();
    } catch (e) {
      toast.error("保存失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (row) => {
    setEditing(row);
    setDraft({
      platform: row.platform || "",
      account: row.account || "",
      password: row.password || "",
      category: row.category || "其他",
      url: row.url || "",
      note: row.note || "",
    });
    setDraftShow(false);
  };

  const saveEdit = async () => {
    if (!draft.platform.trim()) return toast.error("先填平台名");
    try {
      await updateRow("accounts", editing.id, {
        platform: draft.platform.trim(),
        account: draft.account.trim(),
        password: draft.password,
        category: draft.category,
        url: draft.url.trim(),
        note: draft.note.trim(),
      });
      setEditing(null);
      toast.success("已更新");
      load();
    } catch (e) {
      toast.error("更新失败：" + e.message);
    }
  };

  const remove = async (row) => {
    try {
      await deleteRow("accounts", row.id);
      load();
    } catch (e) {
      toast.error("删除失败：" + e.message);
    }
  };

  const filters = ["全部", ...CATEGORIES.filter((c) => rows.some((r) => (r.category || "其他") === c))];

  return (
    <Layout>
      <PageHeader
        title="账号管理"
        subtitle="各平台的账号密码集中记一处，支持一键复制、强度与重复检查"
        action={
          <Button variant="outline" onClick={() => setShowAll((v) => !v)} className="px-2 sm:px-3">
            {showAll ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span className="hidden sm:inline">{showAll ? "隐藏全部" : "显示全部"}</span>
          </Button>
        }
      />

      <div className="max-w-4xl space-y-5 xl:max-w-5xl">
        {/* 统计 */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["账号总数", stats.total, "text-slate-700"],
            ["涉及平台分类", stats.cats, "text-terracotta"],
            ["弱密码", stats.weak, "text-red-500"],
            ["重复使用的账号", stats.dup, "text-amber-600"],
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
            <KeyRound className="h-4 w-4 text-terracotta" /> 记一个账号
          </h2>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>平台</Label>
                <Input
                  value={form.platform}
                  onChange={(e) => setForm({ ...form, platform: e.target.value })}
                  placeholder="比如：小红书、GitHub、招行"
                />
              </div>
              <div>
                <Label>账号（手机 / 邮箱 / 用户名）</Label>
                <Input
                  value={form.account}
                  onChange={(e) => setForm({ ...form, account: e.target.value })}
                  placeholder="登录用的那个"
                />
              </div>
            </div>

            <div>
              <Label>密码</Label>
              <div className="flex gap-1.5">
                <Input
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="粘贴或点右侧生成"
                  className="font-mono"
                />
                <Button variant="subtle" onClick={() => setForm({ ...form, password: genPassword() })} title="生成随机密码">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              {form.password ? (
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                  强度：
                  <span className={`rounded-full px-1.5 py-0.5 ${strengthOf(form.password).cls}`}>
                    {strengthOf(form.password).label}
                  </span>
                  {reuse[form.password] ? `· 这个密码已经用在 ${reuse[form.password]} 个账号上` : null}
                </p>
              ) : null}
            </div>

            <div>
              <Label>分类</Label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setForm({ ...form, category: c })}
                    className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                      form.category === c ? `font-medium ${tintOf(c).chip}` : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>登录地址（可选）</Label>
                <Input
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://…"
                />
              </div>
              <div>
                <Label>备注（可选）</Label>
                <Input
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="密保问题、绑定的手机号、二次验证方式"
                />
              </div>
            </div>

            <Button onClick={add} loading={saving}>
              <Plus className="h-4 w-4" /> 添加账号
            </Button>
          </div>
        </div>

        {/* 搜索 + 筛选 */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
            <Input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder="搜平台 / 账号 / 备注"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filters.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                  filter === c
                    ? c === "全部"
                      ? "border-transparent bg-terracotta font-medium text-white"
                      : `font-medium ${tintOf(c).chip}`
                    : "border-slate-200 bg-white/70 text-slate-500 hover:text-terracotta"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* 列表 */}
        {loading ? (
          <Loading />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            text={rows.length === 0 ? "还没有账号。先把最常忘的那个平台记上" : "这个筛选下没有账号"}
          />
        ) : (
          <div className="space-y-1.5">
            {shown.map((r) => {
              const st = strengthOf(r.password);
              const same = reuse[String(r.password || "").trim()] || 0;
              return (
                <div
                  key={r.id}
                  className={`group rounded-lg border border-l-[3px] border-slate-100 ${tintOf(r.category).edge} bg-white/80 px-3.5 py-2.5 transition-shadow hover:shadow-soft`}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-800">{r.platform}</span>
                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${tintOf(r.category).chip}`}>
                      {r.category || "其他"}
                    </span>
                    {same > 1 ? (
                      <span
                        className="flex shrink-0 items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600"
                        title={`这个密码还用在其他 ${same - 1} 个账号上`}
                      >
                        <ShieldAlert className="h-3 w-3" /> 重复 {same}
                      </span>
                    ) : null}
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="sm" title="编辑" onClick={() => openEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="danger" size="sm" title="删除" onClick={() => remove(r)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {/* 账号 */}
                    <button
                      onClick={() => copy(r.account, "账号已复制")}
                      className="flex items-center gap-1 text-slate-600 hover:text-terracotta"
                      title="复制账号"
                    >
                      <span className="max-w-[14rem] truncate">{r.account}</span>
                      <Copy className="h-3 w-3 opacity-50" />
                    </button>

                    {/* 密码 */}
                    <span className="flex items-center gap-1 font-mono text-slate-500">
                      {showAll ? r.password || "—" : mask(r.password)}
                      {r.password ? (
                        <button onClick={() => copy(r.password, "密码已复制")} className="opacity-50 hover:opacity-100" title="复制密码">
                          <Copy className="h-3 w-3" />
                        </button>
                      ) : null}
                    </span>

                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${st.cls}`}>{st.label}</span>

                    {r.url ? (
                      <a
                        href={/^https?:\/\//.test(r.url) ? r.url : `https://${r.url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-0.5 text-slate-400 hover:text-terracotta"
                      >
                        <Link2 className="h-3 w-3" /> 打开
                      </a>
                    ) : null}
                  </div>

                  {r.note ? <p className="mt-1 truncate text-[11px] text-slate-400">{r.note}</p> : null}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-slate-300">
          数据只存在你自己的服务器上，按登录账号隔离；页面默认打码显示。银行、支付类的高危密码建议只记「账号 + 在哪台设备登录」，密码本身另用系统钥匙串存。
        </p>
      </div>

      {/* 编辑弹窗 */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`编辑 · ${editing?.platform || ""}`}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>平台</Label>
              <Input value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value })} />
            </div>
            <div>
              <Label>账号</Label>
              <Input value={draft.account} onChange={(e) => setDraft({ ...draft, account: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>密码</Label>
            <div className="flex gap-1.5">
              <Input
                type={draftShow ? "text" : "password"}
                value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                className="font-mono"
              />
              <Button variant="subtle" onClick={() => setDraftShow((v) => !v)} title="显示 / 隐藏">
                {draftShow ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button variant="subtle" onClick={() => setDraft({ ...draft, password: genPassword() })} title="生成随机密码">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div>
            <Label>分类</Label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setDraft({ ...draft, category: c })}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    draft.category === c ? `font-medium ${tintOf(c).chip}` : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>登录地址</Label>
              <Input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://…" />
            </div>
            <div>
              <Label>备注</Label>
              <Input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button onClick={saveEdit}>保存</Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
