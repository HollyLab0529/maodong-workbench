import { useEffect, useState } from "react";
import { api } from "../api";
import CatLogo from "../components/CatLogo";
import { Button, Input, Label } from "../components/ui";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [needInvite, setNeedInvite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .config()
      .then(({ needInvite }) => setNeedInvite(needInvite))
      .catch(() => setNeedInvite(false));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const fn = mode === "login" ? api.login : api.register;
      if (mode === "register") await fn(email, password, invite);
      else await fn(email, password);
      // 拉取完整资料（昵称/头像），供侧栏展示
      const { user } = await api.me();
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <CatLogo size={56} className="mb-3 drop-shadow-sm" />
          <h1 className="text-lg font-semibold text-slate-900">猫冬手帐</h1>
          <p className="mt-1 text-xs text-slate-400">
            {mode === "login" ? "慢慢记 · 暖暖存 · 登录继续" : "慢慢记 · 暖暖存 · 创建新账号"}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-soft">
          <div>
            <Label>邮箱</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <Label>密码</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </div>
          {mode === "register" && needInvite ? (
            <div>
              <Label>邀请码</Label>
              <Input
                value={invite}
                onChange={(e) => setInvite(e.target.value.toUpperCase())}
                placeholder="向手帐主人要一枚邀请码"
                required
              />
            </div>
          ) : null}
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          <Button type="submit" loading={loading} className="w-full" size="lg">
            {mode === "login" ? "登录" : "注册并进入"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
            className="w-full text-center text-xs text-slate-400 transition-colors hover:text-terracotta-600"
          >
            {mode === "login" ? "没有账号？创建一个" : "已有账号？去登录"}
          </button>
        </form>
        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-300">
          数据存在主人自己的服务器上，只属于每个账号
        </p>
      </div>
    </div>
  );
}
