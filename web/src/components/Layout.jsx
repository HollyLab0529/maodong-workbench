import { useEffect, useMemo, useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import {
  LogOut,
  Search,
  Moon,
  Sun,
  Download,
  Settings as SettingsIcon,
  LayoutGrid,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useAuth } from "../auth";
import { exportUrl } from "../api";
import { resolveModules, resolveNavGroups } from "../modules";
import { TONE_FG } from "../colors";
import GlobalSearch from "./GlobalSearch";
import CatLogo from "./CatLogo";
import ThemePicker from "./ThemePicker";
import { Modal } from "./ui";

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function useTheme() {
  const [dark, setDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("wb-theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  };
  return { dark, toggle };
}

function Avatar({ user, size = 34 }) {
  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
        alt="头像"
        className="shrink-0 rounded-full border border-slate-200 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-terracotta-100 text-sm font-semibold text-terracotta-700"
      style={{ width: size, height: size }}
    >
      {(user?.nickname || user?.email || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // 桌面侧栏折叠：收成图标条，状态记住
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("wb-sidebar") === "collapsed";
    } catch {
      return false;
    }
  });
  // 桌面侧栏宽度：可拖动调整，记住选择
  const [sbWidth, setSbWidth] = useState(() => {
    try {
      const v = Number(localStorage.getItem("wb-sidebar-w"));
      return v >= 168 && v <= 360 ? v : 224;
    } catch {
      return 224;
    }
  });
  const [resizing, setResizing] = useState(false);
  const location = useLocation();
  const nav = resolveModules(user);
  // 分组导航:用户可在设置页自定义;收起侧栏时隐藏组名,仅隔开
  const groups = useMemo(() => resolveNavGroups(user), [user]);

  const saveWidth = (w) => {
    setSbWidth(w);
    try {
      localStorage.setItem("wb-sidebar-w", String(w));
    } catch {
      /* ignore */
    }
  };

  // 拖右侧边缘调宽窄（168~360px），双击手柄恢复默认 224
  const startResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sbWidth;
    setResizing(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const move = (ev) => setSbWidth(Math.min(360, Math.max(168, startW + ev.clientX - startX)));
    const up = (ev) => {
      setResizing(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      saveWidth(Math.min(360, Math.max(168, startW + ev.clientX - startX)));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const toggleSidebar = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("wb-sidebar", c ? "open" : "collapsed");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  // 移动端顶栏也放一个搜索按钮（长按无效，简单可发现）
  useEffect(() => {
    const onOpen = () => setSearchOpen(true);
    window.addEventListener("wb-open-search", onOpen);
    return () => window.removeEventListener("wb-open-search", onOpen);
  }, []);

  // 切页时自动收起"更多"弹层
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const toolBtn =
    "flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-terracotta-600";

  // 底部 Tab：前 4 个高频模块 + 更多
  const tabNav = nav.slice(0, 4);

  const toolTile = `rounded-lg py-2 text-[10px] text-slate-400 transition-colors hover:bg-slate-100 hover:text-terracotta-600 ${
    collapsed ? "flex items-center justify-center" : "flex flex-col items-center gap-1"
  }`;

  const navItemClass = ({ isActive }) =>
    `flex items-center rounded-lg text-sm transition-colors ${
      collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2"
    } ${
      isActive
        ? "bg-terracotta font-medium text-white shadow-sm"
        : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <div className="flex min-h-screen">
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} toggle={() => setSearchOpen((v) => !v)} />

      {/* 桌面侧栏：可折叠成图标条 */}
      <aside
        style={collapsed ? undefined : { width: sbWidth }}
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200/70 bg-white/70 py-6 backdrop-blur md:flex ${
          collapsed ? "w-[68px] px-2.5" : "px-4"
        } ${resizing ? "" : "transition-[width] duration-200"}`}
      >
        {collapsed ? null : (
          <div
            onMouseDown={startResize}
            onDoubleClick={() => saveWidth(224)}
            title="拖动可调整侧栏宽度，双击恢复默认"
            className={`absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize transition-colors ${
              resizing ? "bg-terracotta/40" : "hover:bg-terracotta/25"
            }`}
          />
        )}
        <div className={`mb-3 flex items-center ${collapsed ? "justify-center" : "gap-2.5 px-2"}`}>
          <CatLogo size={collapsed ? 34 : 38} />
          {!collapsed ? (
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold text-slate-900">猫冬手帐</p>
              <p className="text-xs text-slate-400">慢慢记 · 暖暖存</p>
            </div>
          ) : null}
        </div>
        <button
          onClick={toggleSidebar}
          title={collapsed ? "展开侧栏" : "收起侧栏"}
          className={`mb-5 flex h-7 items-center rounded-lg text-[11px] text-slate-400 transition-colors hover:bg-slate-100 hover:text-terracotta-600 ${
            collapsed ? "justify-center" : "mx-2 justify-center gap-1.5"
          }`}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" /> 收起</>}
        </button>
        <nav className="flex flex-col gap-1 overflow-y-auto">
          {groups.map((g, gi) => (
            <div key={g.name} className={gi > 0 && !collapsed ? "mt-3" : ""}>
              {!collapsed ? (
                <p className={`mb-1 px-3 text-[10px] font-medium uppercase tracking-wider ${g.rest ? "text-slate-300" : "text-slate-400"}`}>{g.name}</p>
              ) : gi > 0 ? (
                <div className="mx-3 mb-1 border-t border-slate-200/70" />
              ) : null}
              {g.modules.map(({ title, to, icon: Icon, tone }) => (
                <NavLink key={to} to={to} end={to === "/"} title={title} className={navItemClass}>
                  <Icon className={`h-4 w-4 shrink-0 ${TONE_FG[tone] || ""} [[aria-current=page]_&]:text-white`} />
                  {!collapsed ? <span className="truncate">{title}</span> : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="mt-auto space-y-2 border-t border-slate-200/70 pt-3">
          <NavLink to="/store" title="模块超市" className={navItemClass}>
            <LayoutGrid className="h-4 w-4 shrink-0" />
            {!collapsed ? <span>模块超市</span> : null}
          </NavLink>
          <NavLink to="/settings" title="设置" className={navItemClass}>
            <SettingsIcon className="h-4 w-4 shrink-0" />
            {!collapsed ? <span>设置</span> : null}
          </NavLink>
        </div>

        {/* 左下角：小工具 + 个人资料入口 */}
        <div className="mt-auto space-y-2">
          {/* 常用小工具：图标 + 文字，不再靠 hover 猜 */}
          <div className={`gap-1 ${collapsed ? "grid grid-cols-1" : "grid grid-cols-3"}`}>
            <button onClick={toggle} title={dark ? "切换到浅色" : "切换到深色"} className={toolTile}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {!collapsed ? (dark ? "浅色" : "深色") : null}
            </button>
            <ThemePicker className={toolTile} label={collapsed ? "" : "外观"} />
            <a
              href={exportUrl()}
              title="导出全部数据 (JSON)"
              className={toolTile}
            >
              <Download className="h-4 w-4" />
              {!collapsed ? "导出" : null}
            </a>
          </div>

          <NavLink
            to="/settings"
            title="个人资料"
            className={`flex items-center rounded-xl border border-slate-200/70 bg-white/80 p-2.5 transition-colors hover:bg-slate-50 ${
              collapsed ? "justify-center" : "gap-2.5"
            }`}
          >
            <Avatar user={user} />
            {!collapsed ? (
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-slate-800">
                  {user?.nickname || user?.email}
                </span>
                {user?.nickname ? (
                  <span className="block truncate text-[11px] text-slate-400">{user?.bio || user?.email}</span>
                ) : (
                  <span className="block truncate text-[11px] text-slate-400">完善资料 ›</span>
                )}
              </span>
            ) : null}
          </NavLink>
          <button
            onClick={logout}
            title="退出登录"
            className={`flex items-center text-[11px] text-slate-400 transition-colors hover:text-terracotta-600 ${
              collapsed ? "justify-center py-1" : "gap-1.5 px-2"
            }`}
          >
            <LogOut className="h-3 w-3 shrink-0" /> {!collapsed ? "退出登录" : null}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 移动端顶栏：logo + 工具（模块导航移到底部 Tab） */}
        <header className="sticky top-0 z-10 flex items-center gap-1 border-b border-slate-200/70 bg-slate-50/90 px-3 py-2.5 backdrop-blur md:hidden">
          <CatLogo size={26} rounded={8} className="mr-1 shrink-0" />
          <span className="font-display text-sm font-semibold text-slate-900">猫冬手帐</span>
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <button onClick={() => setSearchOpen(true)} className={toolBtn} title="全局搜索">
              <Search className="h-4 w-4" />
            </button>
            <ThemePicker className={toolBtn} />
            <button onClick={toggle} className={toolBtn} title={dark ? "切换到浅色" : "切换到深色"}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8 xl:max-w-6xl 2xl:max-w-7xl">
          <div key={location.pathname} className="page-enter">
            {children}
          </div>
        </main>

        {/* 移动端底部 Tab */}
        <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {tabNav.map(({ title, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors ${
                  isActive ? "font-medium text-terracotta-600" : "text-slate-400"
                }`
              }
            >
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate px-1">{title}</span>
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-slate-400"
          >
            <MoreHorizontal className="h-5 w-5" />
            更多
          </button>
        </nav>

        {/* "更多"抽屉：全部模块 + 超市/设置 */}
        <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="全部模块">
          <div className="grid grid-cols-3 gap-2">
            {nav.map(({ title, to, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-xs transition-colors ${
                    isActive
                      ? "border-terracotta-300 bg-terracotta-50 font-medium text-terracotta-700"
                      : "border-slate-200/70 bg-white text-slate-600 hover:bg-slate-50"
                  }`
                }
              >
                <Icon className="h-5 w-5" />
                <span className="w-full truncate">{title}</span>
              </NavLink>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link
              to="/store"
              onClick={() => setMoreOpen(false)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200/70 bg-white py-2.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              <LayoutGrid className="h-4 w-4" /> 模块超市
            </Link>
            <Link
              to="/settings"
              onClick={() => setMoreOpen(false)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200/70 bg-white py-2.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              <SettingsIcon className="h-4 w-4" /> 设置
            </Link>
          </div>
        </Modal>
      </div>
    </div>
  );
}
