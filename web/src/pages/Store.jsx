import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Layout, { PageHeader } from "../components/Layout";
import { api } from "../api";
import { useAuth } from "../auth";
import { MODULES, resolveModules } from "../modules";
import { Button, EmptyState, toast } from "../components/ui";
import { ArrowDown, ArrowUp, Check, Download, GripVertical, Pin, Trash2, Lightbulb } from "lucide-react";

export default function Store() {
  const { user, setUser } = useAuth();
  const installed = useMemo(() => resolveModules(user), [user]);
  const storeModules = useMemo(
    () => MODULES.filter((m) => !installed.some((i) => i.id === m.id)),
    [installed]
  );
  const dragId = useRef(null);
  const [saving, setSaving] = useState(false);

  const save = async (enabledIds, orderIds) => {
    setSaving(true);
    try {
      const { user: u } = await api.updateProfile({
        modules: { enabled: enabledIds, order: orderIds },
      });
      setUser(u);
    } catch (e) {
      toast.error("保存失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  const persistOrder = (list) => {
    const enabled = MODULES.filter((m) => list.some((x) => x.id === m.id) || m.core).map((m) => m.id);
    const order = list.map((m) => m.id).concat(MODULES.filter((m) => !list.some((x) => x.id === m.id)).map((m) => m.id));
    save(enabled, order);
  };

  const move = (idx, delta) => {
    const list = [...installed];
    const j = idx + delta;
    if (j < 1 || j >= list.length) return; // 总览(0)不可动
    [list[idx], list[j]] = [list[j], list[idx]];
    persistOrder(list);
  };

  const remove = (m) => {
    if (m.core) return;
    const list = installed.filter((x) => x.id !== m.id);
    persistOrder(list);
    toast.success(`已移除「${m.title}」，数据仍保留，随时可取回`);
  };

  const install = (m) => {
    const list = [...installed, m];
    persistOrder(list);
    toast.success(`已获取「${m.title}」`);
  };

  // 拖拽排序
  const onDrop = (targetIdx) => {
    const fromIdx = installed.findIndex((m) => m.id === dragId.current);
    dragId.current = null;
    if (fromIdx <= 0 || targetIdx <= 0 || fromIdx === targetIdx) return;
    const list = [...installed];
    const [moved] = list.splice(fromIdx, 1);
    list.splice(targetIdx, 0, moved);
    persistOrder(list);
  };

  const card = "rounded-xl border border-slate-200/70 bg-white/80 p-4";

  return (
    <Layout>
      <PageHeader
        title="模块超市"
        subtitle="按需搭配你的手帐：获取想要的，移除不需要的，顺序随你摆"
        action={saving ? <span className="text-xs text-slate-400">保存中…</span> : null}
      />

      <div className="max-w-4xl space-y-5 xl:max-w-5xl">
        {/* 我的灵感：常驻入口，不占用模块位 */}
        <Link
          to="/ideas"
          className="group flex items-center gap-3 rounded-xl border border-dashed border-terracotta-200 bg-terracotta-50/40 p-4 transition-colors hover:bg-terracotta-50"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-terracotta/10 text-terracotta">
            <Lightbulb className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-slate-800">我的灵感</span>
            <span className="block text-xs text-slate-500">
              想要什么模块、哪里用着不顺手，先丢进灵感池，再一条条跟到上线
            </span>
          </span>
          <span className="shrink-0 text-xs text-terracotta transition-opacity sm:opacity-60 sm:group-hover:opacity-100">
            去写一条 ›
          </span>
        </Link>

        {/* 已装模块（可排序）：大屏两列，避免右侧大片空白 */}
        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Pin className="h-4 w-4 text-terracotta" /> 已装模块
            <span className="text-xs font-normal text-slate-400">拖动或用箭头排序</span>
          </h2>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {installed.map((m, idx) => (
              <div
                key={m.id}
                draggable={!m.core}
                onDragStart={() => (dragId.current = m.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(idx)}
                className={`flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white/80 p-3 ${
                  m.core ? "opacity-90" : "cursor-grab active:cursor-grabbing"
                }`}
              >
                {!m.core ? (
                  <GripVertical className="h-4 w-4 shrink-0 text-slate-300" />
                ) : (
                  <Pin className="h-4 w-4 shrink-0 text-terracotta-300" />
                )}
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-terracotta-50 text-terracotta-600">
                  <m.icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-800">
                    <span className="truncate">{m.title}</span>
                    {m.core ? <span className="shrink-0 text-[10px] text-slate-300">固定模块</span> : null}
                  </p>
                  <p className="truncate text-xs text-slate-400">{m.desc}</p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {!m.core ? (
                    <>
                      <button onClick={() => move(idx, -1)} disabled={idx <= 1} className="rounded p-1 text-slate-300 transition-colors hover:text-terracotta-600 disabled:opacity-30">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => move(idx, 1)} disabled={idx >= installed.length - 1} className="rounded p-1 text-slate-300 transition-colors hover:text-terracotta-600 disabled:opacity-30">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(m)} title="移除" className="rounded p-1 text-slate-300 transition-colors hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <Link to={m.to} className="text-[11px] text-slate-400 hover:text-terracotta-600">打开 ›</Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 超市 */}
        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Download className="h-4 w-4 text-terracotta" /> 可获取的模块
          </h2>
          {storeModules.length === 0 ? (
            <EmptyState icon={Check} text="超市暂时空了，已装满所有模块" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {storeModules.map((m) => (
                <div key={m.id} className={`${card} flex flex-col`}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <m.icon className="h-4 w-4" />
                    </span>
                    <p className="text-sm font-medium text-slate-800">{m.title}</p>
                  </div>
                  <p className="mb-3 flex-1 text-xs leading-relaxed text-slate-500">{m.desc}</p>
                  <Button size="sm" variant="outline" onClick={() => install(m)}>
                    <Download className="h-3.5 w-3.5" /> 获取
                  </Button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            移除模块不会删数据：记录仍存在服务器里，重新获取后原样回来。
          </p>
        </div>
      </div>
    </Layout>
  );
}
