import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Layout, { PageHeader } from "../components/Layout";
import { api } from "../api";
import { useAuth } from "../auth";
import { MODULES, resolveModules, DEFAULT_GROUPS, UNGROUPED_IDS } from "../modules";
import { Button, EmptyState, Input, toast } from "../components/ui";
import { TONES } from "../colors";
import { ArrowDown, ArrowUp, Check, Download, GripVertical, ListTree, Pin, Plus, RotateCcw, Trash2, Lightbulb } from "lucide-react";

// 模块图标色调：tone → 色块类（与 colors.js TONES 对齐，terracotta 为品牌色）
const ICON_CLS = { ...TONES, terracotta: "bg-terracotta-50 text-terracotta-600" };

export default function Store() {
  const { user, setUser } = useAuth();
  const installed = useMemo(() => resolveModules(user), [user]);
  const storeModules = useMemo(
    () => MODULES.filter((m) => !installed.some((i) => i.id === m.id)),
    [installed]
  );
  const dragId = useRef(null);
  const [saving, setSaving] = useState(false);

  // ===== 导航分组：状态来自 user.nav_groups =====
  const [groups, setGroups] = useState([]);
  const [newGroupName, setNewGroupName] = useState("");

  useEffect(() => {
    const conf = Array.isArray(user?.nav_groups) && user.nav_groups.length ? user.nav_groups : DEFAULT_GROUPS;
    setGroups(conf.map((g) => ({ name: g.name, modules: [...g.modules] })));
  }, [user]);

  const groupIdxOf = (id) => groups.findIndex((g) => g.modules.includes(id));

  const saveGroups = async (clean) => {
    setSaving(true);
    try {
      const { user: u } = await api.updateProfile({ nav_groups: clean });
      if (u) setUser(u);
      else setUser((prev) => ({ ...prev, nav_groups: clean }));
      toast.success("分组已保存，侧栏即刻生效");
    } catch (e) {
      toast.error("保存分组失败：" + e.message);
    } finally {
      setSaving(false);
    }
  };

  // 每个模块卡片上的分组下拉：选择后立即保存
  const setModuleGroup = (id, idxStr) => {
    const idx = Number(idxStr);
    const next = groups.map((g) => ({ name: g.name, modules: g.modules.filter((m) => m !== id) }));
    if (next[idx]) next[idx] = { ...next[idx], modules: [...next[idx].modules, id] };
    setGroups(next);
    saveGroups(next);
  };

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
        subtitle="按需搭配你的手帐：获取想要的，移除不需要的；这里从上到下的顺序就是侧栏的顺序"
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
            <span className="text-xs font-normal text-slate-400">序号＝侧栏位置（总览固定第一）；拖动或用箭头换位置，同一分组内也会按这个顺序排</span>
          </h2>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {installed.map((m, idx) => (
              <div
                key={m.id}
                draggable={!m.core}
                onDragStart={() => (dragId.current = m.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(idx)}
                className={`flex items-center gap-2 rounded-xl border border-slate-200/70 bg-white/80 p-3 ${
                  m.core ? "opacity-90" : "cursor-grab active:cursor-grabbing"
                }`}
              >
                <span className="w-4 shrink-0 text-center text-[11px] font-mono text-slate-300">{idx + 1}</span>
                {!m.core ? (
                  <GripVertical className="h-4 w-4 shrink-0 text-slate-300" />
                ) : (
                  <Pin className="h-4 w-4 shrink-0 text-terracotta-300" />
                )}
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ICON_CLS[m.tone] || ICON_CLS.terracotta}`}>
                  <m.icon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-800">
                    <span className="truncate">{m.title}</span>
                    {m.core ? <span className="shrink-0 text-[10px] text-slate-300">固定模块</span> : null}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs text-slate-400">{m.desc}</p>
                    {!UNGROUPED_IDS.includes(m.id) ? (
                      <select
                        value={groupIdxOf(m.id)}
                        onChange={(e) => setModuleGroup(m.id, e.target.value)}
                        title="所属分组（侧栏里的归类，顺序仍由上面的序号决定）"
                        className="shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-500 transition-colors hover:border-terracotta-300"
                      >
                        <option value={-1}>未分组</option>
                        {groups.map((g, i) => (
                          <option key={i} value={i}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {!m.core ? (
                    <>
                      <button onClick={() => move(idx, -1)} disabled={idx <= 1} title="上移一位" className="rounded p-1 text-slate-300 transition-colors hover:text-terracotta-600 disabled:opacity-30">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => move(idx, 1)} disabled={idx >= installed.length - 1} title="下移一位" className="rounded p-1 text-slate-300 transition-colors hover:text-terracotta-600 disabled:opacity-30">
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

        {/* 侧栏分组管理：组名 / 顺序 / 新建 */}
        <div>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <ListTree className="h-4 w-4 text-terracotta" /> 侧栏分组
            <span className="text-xs font-normal text-slate-400">每个模块右侧的下拉可直接换组，这里改组名和顺序</span>
          </h2>
          <div className={`${card} space-y-2`}>
            {groups.map((g, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                <Input
                  value={g.name}
                  onChange={(e) => setGroups((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  className="h-7 w-32 px-2 text-xs"
                  maxLength={12}
                />
                <span className="ml-1 shrink-0 text-[11px] text-slate-400">{g.modules.length} 个模块</span>
                <div className="ml-auto flex items-center gap-0.5">
                  <button onClick={() => setGroups((l) => { const n = [...l]; const j = i - 1; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; })} title="上移" className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setGroups((l) => { const n = [...l]; const j = i + 1; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; })} title="下移" className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setGroups((l) => l.filter((_, j) => j !== i))} title="删除分组（模块回到未分组）" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="新分组名" className="h-8 w-32 text-xs" maxLength={12} />
              <Button size="sm" variant="outline" onClick={() => {
                const name = newGroupName.trim();
                if (!name) return toast.error("先填分组名");
                if (groups.some((g) => g.name === name)) return toast.error("已有同名分组");
                setGroups((l) => [...l, { name, modules: [] }]);
                setNewGroupName("");
              }}><Plus className="h-3.5 w-3.5" /> 新建分组</Button>
              <div className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setGroups(DEFAULT_GROUPS.map((g) => ({ name: g.name, modules: [...g.modules] })))}><RotateCcw className="h-3.5 w-3.5" /> 恢复默认</Button>
                <Button size="sm" onClick={() => {
                  const clean = groups.map((g) => ({ name: g.name.trim(), modules: g.modules })).filter((g) => g.name);
                  if (!clean.length) return toast.error("至少保留一个分组");
                  saveGroups(clean);
                }}><Check className="h-3.5 w-3.5" /> 保存分组</Button>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              侧栏规则：分区（分组）的先后由这里的上下箭头决定，分区里模块的先后由「已装模块」的序号决定；总览、模块超市、设置不参与分组。改组名/顺序后点「保存分组」，模块下拉换组即时生效。
            </p>
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
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${ICON_CLS[m.tone] || ICON_CLS.slate}`}>
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
