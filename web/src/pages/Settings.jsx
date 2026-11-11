import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Layout, { PageHeader } from "../components/Layout";
import { api, exportUrl, uploadImage } from "../api";
import { useAuth } from "../auth";
import { PALETTES, usePalette } from "../theme";
import FontPicker from "../components/FontPicker";
import Customize from "./settings/Customize";
import { Button, Input, Label, Loading, toast } from "../components/ui";
import {
  Bot,
  Copy,
  RefreshCw,
  Trash2,
  Download,
  ShieldCheck,
  Palette,
  Type,
  Ticket,
  UserRound,
  Camera,
  Plus,
  Check,
  KeyRound,
  Sparkles,
} from "lucide-react";

const ORIGIN = typeof window !== "undefined" ? window.location.origin : "";

const SAMPLE = `curl -X POST ${ORIGIN}/api/data/kb_articles \\
  -H "Authorization: Bearer <你的令牌>" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"标题","category":"技术学习","tags":"标签","content":"Markdown 正文","updated_at":"2026-01-01T00:00:00Z"}'`;

export default function Settings() {
  const { user, setUser } = useAuth();
  const [tokenInfo, setTokenInfo] = useState(null); // {exists, created_at}
  const [plainToken, setPlainToken] = useState(""); // 仅生成后展示一次
  const [apiTokens, setApiTokens] = useState([]);
  const [tokenName, setTokenName] = useState("");
  const [tokenScope, setTokenScope] = useState("read");
  const [plainApiToken, setPlainApiToken] = useState("");
  const [invites, setInvites] = useState([]);
  const [profile, setProfile] = useState({ nickname: "", bio: "", avatar: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const { palette, setPalette } = usePalette();

  const load = async () => {
    try {
      const [info, inv] = await Promise.all([api.assistantTokenStatus(), api.listInvites()]);
      setTokenInfo(info);
      setInvites(inv.rows || []);
    } catch (e) {
      toast.error("加载失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (user) setProfile({ nickname: user.nickname || "", bio: user.bio || "", avatar: user.avatar || "" });
  }, [user]);

  // ---------- 个人资料 ----------
  const pickAvatar = () => fileRef.current?.click();

  const onAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("请选择图片文件");
    setUploading(true);
    try {
      const url = await uploadImage(file);
      const { user: u } = await api.updateProfile({ avatar: url });
      setUser(u);
      setProfile({ nickname: u.nickname, bio: u.bio, avatar: u.avatar });
      toast.success("头像已更新");
    } catch (err) {
      toast.error("上传失败：" + err.message);
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const { user: u } = await api.updateProfile({
        nickname: profile.nickname.trim(),
        bio: profile.bio.trim(),
      });
      setUser(u);
      toast.success("资料已保存");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingProfile(false);
    }
  };

  // ---------- 邀请码 ----------
  const createInvite = async () => {
    setBusy(true);
    try {
      const { row } = await api.createInvite("");
      setInvites((prev) => [row, ...prev]);
      toast.success("邀请码已生成");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeInvite = async (inv) => {
    if (!window.confirm(`删除邀请码 ${inv.code}？`)) return;
    try {
      await api.deleteInvite(inv.id);
      setInvites((prev) => prev.filter((i) => i.id !== inv.id));
      toast.success("已删除");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制");
    } catch {
      toast.error("复制失败，请手动选中");
    }
  };

  // ---------- 助手令牌 ----------
  const generate = async () => {
    if (!window.confirm(plainToken || tokenInfo?.exists
      ? "重新生成会让旧令牌立即失效，确定？"
      : "生成后令牌只显示一次，请立即保存。确定生成？")) return;
    setBusy(true);
    try {
      const { token } = await api.assistantTokenCreate();
      setPlainToken(token);
      await load();
      toast.success("令牌已生成，请立即复制保存");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!window.confirm("删除令牌后，所有使用该令牌的自动化都会立即失效。确定删除？")) return;
    setBusy(true);
    try {
      await api.assistantTokenRevoke();
      setPlainToken("");
      await load();
      toast.success("令牌已删除");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ---------- 开放 API 令牌 ----------
  const loadTokens = async () => {
    try {
      const { tokens } = await api.listTokens();
      setApiTokens(tokens || []);
    } catch (e) {
      toast.error("令牌列表加载失败：" + e.message);
    }
  };
  useEffect(() => { loadTokens(); }, []);

  const newToken = async () => {
    if (!tokenName.trim()) return toast.error("先给令牌起个名字，方便以后辨认");
    setBusy(true);
    try {
      const { plain } = await api.createToken(tokenName.trim(), tokenScope);
      setPlainApiToken(plain);
      setTokenName("");
      await loadTokens();
      toast.success("令牌已创建，明文只显示一次");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeToken = async (t) => {
    if (!window.confirm(`吊销「${t.name}」？使用它的脚本 / 快捷指令会立即失效。`)) return;
    try {
      await api.revokeToken(t.id);
      await loadTokens();
      toast.success("已吊销");
    } catch (e) {
      toast.error(e.message);
    }
  };

  // ---------- AI 配置 ----------
  const [aiCfg, setAiCfg] = useState({ enabled: false, base_url: "", model: "", has_key: false, key_hint: "" });
  const [aiKey, setAiKey] = useState("");
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState(null);
  const [aiUsage, setAiUsage] = useState(null);
  const [savingAi, setSavingAi] = useState(false);

  const loadAi = async () => {
    try {
      const { config } = await api.aiConfig();
      setAiCfg(config);
      api.aiUsage().then(setAiUsage).catch(() => {});
    } catch {
      /* AI 未加载不影响页面 */
    }
  };
  useEffect(() => { loadAi(); }, []);

  const saveAi = async () => {
    setSavingAi(true);
    try {
      const patch = { base_url: aiCfg.base_url, model: aiCfg.model, enabled: aiCfg.enabled };
      if (aiKey.trim()) patch.key = aiKey.trim();
      const { config } = await api.saveAiConfig(patch);
      setAiCfg(config);
      setAiKey("");
      toast.success("AI 配置已保存");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingAi(false);
    }
  };

  const testAi = async () => {
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const r = await api.testAi();
      setAiTestResult({ ok: true, ...r });
      loadAi();
    } catch (e) {
      setAiTestResult({ ok: false, error: e.message });
    } finally {
      setAiTesting(false);
    }
  };

  const card = "rounded-xl border border-slate-200/70 bg-white/80 p-5";

  return (
    <Layout>
      <PageHeader title="设置" subtitle="个人资料、配色、邀请码与数据安全" />

      {loading ? (
        <Loading />
      ) : (
        <div className="max-w-2xl space-y-5 xl:max-w-3xl">
          {/* 个人资料 */}
          <div className={card}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <UserRound className="h-4 w-4 text-terracotta" /> 个人资料
            </h2>
            <div className="flex items-start gap-4">
              <button
                onClick={pickAvatar}
                className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100"
                title="点击上传头像"
              >
                {profile.avatar ? (
                  <img src={profile.avatar} alt="头像" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-slate-400">
                    {(profile.nickname || user?.email || "?").slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-slate-900/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera className="h-5 w-5" />
                </span>
                {uploading ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[10px] text-slate-500">
                    上传中
                  </span>
                ) : null}
              </button>
              <div className="min-w-0 flex-1 space-y-2.5">
                <div>
                  <Label>昵称</Label>
                  <Input
                    value={profile.nickname}
                    onChange={(e) => setProfile({ ...profile, nickname: e.target.value })}
                    placeholder="朋友怎么称呼你"
                    maxLength={24}
                  />
                </div>
                <div>
                  <Label>一句话签名</Label>
                  <Input
                    value={profile.bio}
                    onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                    placeholder="比如：在慢慢整理自己的生活"
                    maxLength={60}
                  />
                </div>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatar} />
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-400">
                {user?.email} · 资料只存在你自己的服务器
              </p>
              <Button size="sm" onClick={saveProfile} loading={savingProfile}>
                <Check className="h-3.5 w-3.5" /> 保存资料
              </Button>
            </div>
          </div>

          {/* 状态与标签自定义 */}
          <Customize />

          {/* 配色 */}
          <div className={card}>
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Palette className="h-4 w-4 text-terracotta" /> 配色方案
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              「复古纸」取自作品集，米色纸 + 砖红；和侧栏的月亮按钮（浅色/深色）自由搭配。
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PALETTES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPalette(p.id)}
                  className={`rounded-xl border p-2.5 text-left transition-colors ${
                    palette === p.id ? "border-terracotta-400 bg-terracotta-50" : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <span
                    className="mb-1.5 flex h-10 w-full items-end justify-end gap-1 rounded-lg border border-slate-200/60 p-1"
                    style={{ background: p.bg }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.accent }} />
                    <span className="h-2.5 w-2.5 rounded-full border border-slate-200" style={{ background: p.card }} />
                  </span>
                  <span className="block text-xs font-medium text-slate-800">{p.name}</span>
                  <span className="block text-[11px] text-slate-400">{p.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 字体 */}
          <div className={card}>
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Type className="h-4 w-4 text-terracotta" /> 字体排版
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              全部用系统自带字体，不下载、不拖慢；标题和正文可以分别挑，手帐的味道就不一样了。
            </p>
            <FontPicker />
          </div>

          {/* 邀请码 */}
          <div className={card}>
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Ticket className="h-4 w-4 text-terracotta" /> 邀请码
            </h2>
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              第一个账号（你自己）注册时不需要邀请码；此后朋友注册必须持一枚有效邀请码。
              每枚只能用一次，用完自动标记「已使用」。
            </p>
            <div className="mb-3 flex items-center gap-2">
              <Button size="sm" onClick={createInvite} loading={busy}>
                <Plus className="h-3.5 w-3.5" /> 生成邀请码
              </Button>
              <span className="text-[11px] text-slate-400">剩 {invites.filter((i) => !i.used_by).length} 枚可用</span>
            </div>
            {invites.length === 0 ? (
              <p className="text-xs text-slate-400">还没有生成过邀请码</p>
            ) : (
              <div className="space-y-1.5">
                {invites.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2"
                  >
                    <code className="font-mono text-sm font-medium tracking-wider text-slate-800">{inv.code}</code>
                    {inv.used_by ? (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-500">
                        已使用 · {inv.used_by}
                      </span>
                    ) : (
                      <button
                        onClick={() => copy(inv.code)}
                        className="flex items-center gap-0.5 text-[11px] text-terracotta-600 hover:underline"
                      >
                        <Copy className="h-3 w-3" /> 复制
                      </button>
                    )}
                    <span className="ml-auto text-[10px] text-slate-300">
                      {String(inv.created_at).slice(0, 10)}
                    </span>
                    {!inv.used_by ? (
                      <button
                        onClick={() => removeInvite(inv)}
                        className="rounded p-1 text-slate-300 transition-colors hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 助手令牌 */}
          <div className={card}>
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Bot className="h-4 w-4 text-terracotta" /> 助手接入令牌
            </h2>
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              生成后把令牌交给你使用的 AI 助手或脚本（CatPaw、Claude Code、iOS 快捷指令等均可），它就能直接读写你的手帐——你说「把这段整理成文章」，它建好即见效，无需 API 公司、零额外费用。
              令牌以哈希存储，页面不会再次显示；随时可重置或删除。
            </p>

            {plainToken ? (
              <div className="mb-3 rounded-lg border border-terracotta-200 bg-terracotta-50 p-3">
                <p className="mb-1.5 text-xs font-medium text-terracotta-700">⚠️ 新令牌（只显示这一次）：</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1.5 font-mono text-xs text-slate-700">{plainToken}</code>
                  <Button variant="subtle" size="sm" onClick={() => copy(plainToken)}><Copy className="h-3.5 w-3.5" /> 复制</Button>
                </div>
                <p className="mt-1.5 text-[11px] text-terracotta-600">
                  保存好后把令牌发给助手即可；也可以自己用下方示例调用。
                </p>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Button onClick={generate} loading={busy}>
                <RefreshCw className="h-4 w-4" /> {tokenInfo?.exists ? "重新生成" : "生成令牌"}
              </Button>
              {tokenInfo?.exists ? (
                <Button variant="danger" onClick={revoke} disabled={busy}>
                  <Trash2 className="h-4 w-4" /> 删除令牌
                </Button>
              ) : null}
              {tokenInfo?.exists && !plainToken ? (
                <span className="text-xs text-slate-400">
                  已启用（生成于 {String(tokenInfo.created_at || "").slice(0, 10)}）
                </span>
              ) : null}
            </div>

            <div className="mt-4">
              <Label>调用示例（助手或其他脚本可用）</Label>
              <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-50">{SAMPLE}</pre>
            </div>
          </div>

          {/* 开放 API */}
          <div className={card}>
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <KeyRound className="h-4 w-4 text-terracotta" /> API 访问
            </h2>
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              创建令牌，让手机快捷指令、脚本或 AI 助手通过 REST API 读写你的数据。
              令牌以哈希存储，明文只在创建时显示一次；每令牌每分钟限 120 次请求。
              <Link to="/api-doc" className="ml-1 font-medium text-terracotta-600 hover:underline">查看 API 文档 →</Link>
            </p>

            {plainApiToken ? (
              <div className="mb-3 rounded-lg border border-terracotta-200 bg-terracotta-50 p-3">
                <p className="mb-1.5 text-xs font-medium text-terracotta-700">⚠️ 新令牌（只显示这一次）：</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1.5 font-mono text-xs text-slate-700">{plainApiToken}</code>
                  <Button variant="subtle" size="sm" onClick={() => copy(plainApiToken)}><Copy className="h-3.5 w-3.5" /> 复制</Button>
                </div>
              </div>
            ) : null}

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Input
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                placeholder="令牌名称，如：iPhone 快捷指令"
                className="w-48"
                maxLength={30}
              />
              <div className="flex overflow-hidden rounded-lg border border-slate-200">
                <button
                  onClick={() => setTokenScope("read")}
                  className={`px-3 py-2 text-xs transition-colors ${tokenScope === "read" ? "bg-terracotta text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                  只读
                </button>
                <button
                  onClick={() => setTokenScope("write")}
                  className={`px-3 py-2 text-xs transition-colors ${tokenScope === "write" ? "bg-terracotta text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                  读写
                </button>
              </div>
              <Button onClick={newToken} loading={busy}>
                <Plus className="h-4 w-4" /> 创建令牌
              </Button>
            </div>

            {apiTokens.length === 0 ? (
              <p className="text-xs text-slate-400">还没有创建过 API 令牌</p>
            ) : (
              <div className="space-y-1.5">
                {apiTokens.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                    <span className="text-sm font-medium text-slate-800">{t.name}</span>
                    <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-400">{t.prefix}…</code>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${t.scope === "write" ? "bg-terracotta-100 text-terracotta-700" : "bg-slate-200 text-slate-500"}`}>
                      {t.scope === "write" ? "读写" : "只读"}
                    </span>
                    <span className="text-[10px] text-slate-300">
                      {t.last_used_at ? `最近使用 ${String(t.last_used_at).slice(0, 10)}` : `创建于 ${String(t.created_at).slice(0, 10)} · 未使用`}
                    </span>
                    <button
                      onClick={() => removeToken(t)}
                      className="ml-auto rounded p-1 text-slate-300 transition-colors hover:text-red-500"
                      title="吊销令牌"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI 助手 */}
          <div className={card}>
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Sparkles className="h-4 w-4 text-terracotta" /> AI 助手
            </h2>
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              填一个 OpenAI 兼容端点即可启用：DeepSeek / Kimi / 智谱 / 通义，或局域网里的 Ollama。
              Key 以 AES-256-GCM 加密存在服务器上，页面永远只显示末四位。
            </p>

            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setAiCfg({ ...aiCfg, enabled: !aiCfg.enabled })}
                  className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs transition-colors ${
                    aiCfg.enabled ? "border-terracotta-300 bg-terracotta-50 text-terracotta-700" : "border-slate-200 bg-white text-slate-400"}`}>
                  <span className={`h-2 w-2 rounded-full ${aiCfg.enabled ? "bg-terracotta" : "bg-slate-300"}`} />
                  {aiCfg.enabled ? "已启用" : "未启用"}
                </button>
                {aiCfg.has_key ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] text-slate-500">Key {aiCfg.key_hint}</span>
                ) : null}
                {aiUsage && aiUsage.total_calls > 0 ? (
                  <span className="text-[11px] text-slate-400">
                    累计 {aiUsage.total_calls} 次调用 · {aiUsage.total_tokens.toLocaleString()} tokens
                  </span>
                ) : null}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div>
                  <Label>API 端点（OpenAI 兼容）</Label>
                  <Input
                    value={aiCfg.base_url}
                    onChange={(e) => setAiCfg({ ...aiCfg, base_url: e.target.value })}
                    placeholder="https://api.deepseek.com/v1"
                  />
                </div>
                <div>
                  <Label>模型名称</Label>
                  <Input
                    value={aiCfg.model}
                    onChange={(e) => setAiCfg({ ...aiCfg, model: e.target.value })}
                    placeholder="deepseek-chat"
                  />
                </div>
              </div>
              <div>
                <Label>API Key {aiCfg.has_key ? "（留空则不修改）" : ""}</Label>
                <Input
                  type="password"
                  value={aiKey}
                  onChange={(e) => setAiKey(e.target.value)}
                  placeholder={aiCfg.has_key ? "••••••••" : "sk-..."}
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={saveAi} loading={savingAi}><Check className="h-4 w-4" /> 保存配置</Button>
                <Button variant="outline" onClick={testAi} loading={aiTesting} disabled={!aiCfg.enabled}>
                  测试连接
                </Button>
                {aiTestResult ? (
                  <span className={`text-xs ${aiTestResult.ok ? "text-emerald-600" : "text-red-500"}`}>
                    {aiTestResult.ok
                      ? `✓ ${aiTestResult.model} · ${aiTestResult.latency_ms}ms`
                      : `✗ ${aiTestResult.error}`}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* 数据 */}
          <div className={card}>
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShieldCheck className="h-4 w-4 text-terracotta" /> 账号与数据
            </h2>
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              密码经 bcrypt 哈希存储，会话为 30 天有效签名 Cookie。服务器每天自动备份一次（保留 14 份，位于 /opt/workbench/data/backups/）。
              也可以随时把全部数据导出为 JSON 文件保存在自己电脑上。
            </p>
            <a href={exportUrl()} target="_blank" rel="noreferrer">
              <Button variant="outline"><Download className="h-4 w-4" /> 导出全部数据</Button>
            </a>
          </div>
        </div>
      )}
    </Layout>
  );
}
