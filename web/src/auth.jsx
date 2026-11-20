import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";
import Login from "./pages/Login";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // 演示站标记：正式站后端 demo 恒为 null，所以这里永远是 false
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    // 演示站支持 ?demo=1 自动登录：作品集里用 iframe 嵌真实页面时，直接落到总览页而不是登录页。
    // 凭据只由后端在 DEMO_MODE 下返回（正式站 demo 为 null），这段逻辑在正式站不会生效。
    const autoDemo = new URLSearchParams(window.location.search).get("demo") === "1";
    const boot = async () => {
      try {
        const { demo } = await api.config();
        setDemoMode(!!demo);
        if (autoDemo && demo) {
          await api.login(demo.email, demo.password);
          // 登录成功后从地址栏抹掉 demo 参数，访客点「退出登录」才会回到登录页
          const url = new URL(window.location.href);
          url.searchParams.delete("demo");
          window.history.replaceState(null, "", url.toString());
        }
      } catch {
        // 拿不到配置就当正式站，自动登录也就不会发生
      }
      try {
        const { user: u } = await api.me();
        setUser(u);
      } catch {
        setUser(null);
      }
      setLoading(false);
    };
    boot();
  }, []);

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        正在载入猫冬手帐…
      </div>
    );
  }

  if (!user) return <Login onLogin={setUser} demoMode={demoMode} />;

  return (
    <AuthContext.Provider value={{ user, setUser, logout, demoMode }}>{children}</AuthContext.Provider>
  );
}
