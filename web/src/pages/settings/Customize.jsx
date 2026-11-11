import { useEffect, useState } from "react";
import { listRows, insertRow, updateRow, api } from "../../api";
import { Button, Input, Label, toast } from "../../components/ui";
import { JOB_STATUSES, TONE_NAMES, toneChip, registerTagColors } from "../../colors";
import { ArrowUp, ArrowDown, Plus, RotateCcw, Check, Palette, Tags, Trash2, ListTree } from "lucide-react";
import { useAuth } from "../../auth";
import { resolveModules, DEFAULT_GROUPS, UNGROUPED_IDS } from "../../modules";

const DEFAULT_STATUSES = JOB_STATUSES.map((name, i) => ({
  name,
  tone: ["teal", "blue", "purple", "amber", "orange", "rose", "pink", "green", "slate"][i] || "slate",
}));

const card = "rounded-xl border border-slate-200/70 bg-white/80 p-5";

// 小色板:点一个 tone
function TonePicker({ value, onPick }) {
  return (
    <div className="flex flex-wrap gap-1">
      {TONE_NAMES.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onPick(t)}
          className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${
            value === t ? "border-slate-700" : "border-transparent"
          } ${toneChip(t).split(" ")[0]}`}
          title={t}
        />
      ))}
    </div>
  );
}

async function saveSetting(key, value) {
  const rows = await listRows("settings");
  const hit = rows.find((r) => r.key === key);
  if (hit) await updateRow("settings", hit.id, { value });
  else await insertRow("settings", { key, value });
}

// ===== 导航分组管理:组名/归属/顺序全部可改,存 user.nav_groups =====
function NavGroupsManager() {
  const { user, setUser } = useAuth();
  const [groups, setGroups] = useState([]);
  const [newName, setNewName] = useState("");
  const [addingTo, setAddingTo] = useState(-1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const conf = Array.isArray(user?.nav_groups) && user.nav_groups.length ? user.nav_groups : DEFAULT_GROUPS;
    setGroups(conf.map((g) => ({ name: g.name, modules: [...g.modules] })));
  }, [user]);

  const enabled = resolveModules(user).filter((m) => !UNGROUPED_IDS.includes(m.id));
  const inAny = new Set(groups.flatMap((g) => g.modules));
  const pool = enabled.filter((m) => !inAny.has(m.id));
  const titleOf = (id) => (enabled.find((m) => m.id === id) || {}).title || id;

  const save = async () => {
    const clean = groups.map((g) => ({ name: g.name.trim(), modules: g.modules })).filter((g) => g.name);
    if (!clean.length) return toast.error("至少保留一个分组(或恢复默认)");
    setSaving(true);
    try {
      const { user: updated } = await api.updateProfile({ nav_groups: clean });
      if (updated) setUser(updated);
      else setUser((u) => ({ ...u, nav_groups: clean }));
      setGroups(clean);
      toast.success("分组已保存,侧栏即刻生效");
    } catch (e) {
      toast.error("保存失败:" + e.message);
    } finally {
      setSaving(false);
    }
  };

  const moveGroup = (i, d) => setGroups((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; });

  return (
    <div className={card}>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <ListTree className="h-4 w-4 text-terracotta" /> 导航分组
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        组名、归属、顺序都能改;点模块的 ✕ 移到未分组,点组的「＋」从未分组取回。总览、模块超市、设置不参与分组。
      </p>
      <div className="space-y-2">
        {groups.map((g, i) => (
          <div key={i} className="rounded-lg bg-slate-50 p-2.5">
            <div className="flex items-center gap-2">
              <Input
                value={g.name}
                onChange={(e) => setGroups((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                className="h-7 w-28 px-2 text-xs"
                maxLength={12}
              />
              <div className="ml-auto flex items-center gap-0.5">
                <button onClick={() => setAddingTo(addingTo === i ? -1 : i)} title="从未分组添加"
                  className={`rounded p-1 ${addingTo === i ? "bg-terracotta-50 text-terracotta-600" : "text-slate-400 hover:bg-slate-200 hover:text-slate-700"}`}><Plus className="h-3.5 w-3.5" /></button>
                <button onClick={() => moveGroup(i, -1)} title="上移" className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button onClick={() => moveGroup(i, 1)} title="下移" className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button onClick={() => setGroups((l) => l.filter((_, j) => j !== i))} title="删除分组(模块回到未分组)"
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            {g.modules.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {g.modules.map((id) => (
                  <span key={id} className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200">
                    {titleOf(id)}
                    <button onClick={() => setGroups((l) => l.map((x, j) => (j === i ? { ...x, modules: x.modules.filter((m) => m !== id) } : x)))}
                      className="text-slate-300 hover:text-red-500" title="移到未分组">✕</button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] text-slate-400">空分组,点「＋」添加模块</p>
            )}
            {addingTo === i && pool.length ? (
              <div className="mt-2 flex flex-wrap items-center gap-1 rounded-md bg-terracotta-50/60 p-2">
                {pool.map((m) => (
                  <button key={m.id} onClick={() => setGroups((l) => l.map((x, j) => (j === i ? { ...x, modules: [...x.modules, m.id] } : x)))}
                    className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200 hover:ring-terracotta-300">
                    ＋ {m.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {pool.length && addingTo < 0 ? (
        <p className="mt-2 text-[11px] text-slate-400">未归组:{pool.map((m) => m.title).join("、")}(点某组的「＋」加入)</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="新分组名" className="h-8 w-32 text-xs" maxLength={12} />
        <Button size="sm" variant="outline"
          onClick={() => {
            const name = newName.trim();
            if (!name) return toast.error("先填分组名");
            setGroups((l) => [...l, { name, modules: [] }]);
            setNewName("");
          }}><Plus className="h-3.5 w-3.5" /> 新建分组</Button>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => { setGroups(DEFAULT_GROUPS.map((g) => ({ name: g.name, modules: [...g.modules] }))); setAddingTo(-1); }}>
            <RotateCcw className="h-3.5 w-3.5" /> 恢复默认
          </Button>
          <Button size="sm" onClick={save} loading={saving}><Check className="h-3.5 w-3.5" /> 保存分组</Button>
        </div>
      </div>
    </div>
  );
}

export default function Customize() {
  // ---- 求职状态 ----
  const [statuses, setStatuses] = useState(DEFAULT_STATUSES);
  const [newStatus, setNewStatus] = useState("");
  const [newStatusTone, setNewStatusTone] = useState("teal");
  const [savingStatus, setSavingStatus] = useState(false);

  // ---- 标签 ----
  const [tagMap, setTagMap] = useState({}); // 已保存的自定义配色
  const [tagStats, setTagStats] = useState([]); // 全站标签 [name, count]
  const [selTag, setSelTag] = useState("");
  const [newTag, setNewTag] = useState("");
  const [savingTag, setSavingTag] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const rows = await listRows("settings");
        const s = rows.find((r) => r.key === "job_statuses");
        if (s?.value) {
          const v = JSON.parse(s.value);
          if (Array.isArray(v) && v.length) setStatuses(v);
        }
        const t = rows.find((r) => r.key === "tag_colors");
        if (t?.value) {
          const v = JSON.parse(t.value) || {};
          setTagMap(v);
          registerTagColors(v);
        }
      } catch { /* 首次无配置 */ }
      // 统计全站标签(kb_articles / quick_notes / recipes)
      const count = {};
      const add = (raw, sep) =>
        String(raw || "").split(sep).map((x) => x.trim()).filter(Boolean)
          .forEach((x) => { count[x] = (count[x] || 0) + 1; });
      try {
        for (const a of await listRows("kb_articles")) add(a.tags, /[,，]/);
        for (const n of await listRows("quick_notes")) add(n.tags, /[,，]/);
        for (const r of await listRows("recipes")) add(r.tags, /[,，\s]+/);
      } catch { /* 忽略单集合失败 */ }
      setTagStats(Object.entries(count).sort((a, b) => b[1] - a[1]));
    })();
  }, []);

  const move = (i, dir) => {
    setStatuses((list) => {
      const next = [...list];
      const j = i + dir;
      if (j < 0 || j >= next.length) return next;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const saveStatuses = async () => {
    const clean = statuses.map((s) => ({ name: String(s.name).trim(), tone: s.tone })).filter((s) => s.name);
    if (!clean.length) return toast.error("至少保留一个状态");
    setSavingStatus(true);
    try {
      await saveSetting("job_statuses", JSON.stringify(clean));
      setStatuses(clean);
      toast.success("状态配置已保存,重新进入看板生效");
    } catch (e) {
      toast.error("保存失败:" + e.message);
    } finally {
      setSavingStatus(false);
    }
  };

  const saveTags = async (map, msg) => {
    setSavingTag(true);
    try {
      await saveSetting("tag_colors", JSON.stringify(map));
      setTagMap(map);
      registerTagColors(map); // 本页即时生效
      if (msg) toast.success(msg);
    } catch (e) {
      toast.error("保存失败:" + e.message);
    } finally {
      setSavingTag(false);
    }
  };

  // 从三个集合的记录里剥掉指定标签
  const removeTagEverywhere = async (tag) => {
    if (!window.confirm(`从所有文章/笔记/菜谱中删除标签「${tag}」?`)) return;
    try {
      const stripComma = (raw) =>
        String(raw || "").split(/[,，]/).map((x) => x.trim()).filter((x) => x && x !== tag).join(", ");
      const stripSpace = (raw) =>
        String(raw || "").split(/[,，\s]+/).filter((x) => x && x !== tag).join(" ");
      for (const a of await listRows("kb_articles")) {
        if (String(a.tags || "").split(/[,，]/).map((x) => x.trim()).includes(tag))
          await updateRow("kb_articles", a.id, { tags: stripComma(a.tags), updated_at: new Date().toISOString() });
      }
      for (const n of await listRows("quick_notes")) {
        if (String(n.tags || "").split(/[,，]/).map((x) => x.trim()).includes(tag))
          await updateRow("quick_notes", n.id, { tags: stripComma(n.tags) });
      }
      for (const r of await listRows("recipes")) {
        if (String(r.tags || "").split(/[,，\s]+/).filter(Boolean).includes(tag))
          await updateRow("recipes", r.id, { tags: stripSpace(r.tags) });
      }
      const next = { ...tagMap };
      delete next[tag];
      await saveTags(next);
      setTagStats((list) => list.filter(([n]) => n !== tag));
      if (selTag === tag) setSelTag("");
      toast.success(`标签「${tag}」已全站删除`);
    } catch (e) {
      toast.error("删除失败:" + e.message);
    }
  };

  return (
    <>
      {/* 求职状态自定义 */}
      <div className={card}>
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Palette className="h-4 w-4 text-terracotta" /> 求职状态自定义
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          增删、排序、配色都会反映到求职看板和总览页;历史记录里的旧状态名以自动配色兜底,不会丢。
        </p>
        <div className="space-y-1.5">
          {statuses.map((s, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${toneChip(s.tone)}`}>{s.name}</span>
              <div className="ml-auto"><TonePicker value={s.tone} onPick={(t) => setStatuses((l) => l.map((x, j) => (j === i ? { ...x, tone: t } : x)))} /></div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button onClick={() => move(i, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" title="上移"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button onClick={() => move(i, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" title="下移"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button
                  onClick={() => setStatuses((l) => l.filter((_, j) => j !== i))}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                  title="删除状态"
                ><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input value={newStatus} onChange={(e) => setNewStatus(e.target.value)} placeholder="新状态名,如:内推中" className="h-8 w-40 text-xs" />
          <TonePicker value={newStatusTone} onPick={setNewStatusTone} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const name = newStatus.trim();
              if (!name) return toast.error("先填状态名");
              if (statuses.some((s) => s.name === name)) return toast.error("已有同名状态");
              setStatuses((l) => [...l, { name, tone: newStatusTone }]);
              setNewStatus("");
            }}
          ><Plus className="h-3.5 w-3.5" /> 添加</Button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={saveStatuses} loading={savingStatus}><Check className="h-3.5 w-3.5" /> 保存状态配置</Button>
          <Button size="sm" variant="ghost" onClick={() => setStatuses(DEFAULT_STATUSES)}><RotateCcw className="h-3.5 w-3.5" /> 恢复默认</Button>
        </div>
      </div>

      {/* 导航分组 */}
      <NavGroupsManager />

      {/* 标签配色管理 */}
      <div className={card}>
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Tags className="h-4 w-4 text-terracotta" /> 标签配色
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          点一个标签再选颜色,同一标签全站同色;未设置的按名字自动配色。删除会把它从所有文章/笔记/菜谱里移除。
        </p>

        {tagStats.length ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {tagStats.map(([name, count]) => (
              <button
                key={name}
                onClick={() => setSelTag(name === selTag ? "" : name)}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-all ${toneChip(tagMap[name])} ${
                  selTag === name ? "font-medium ring-2 ring-terracotta-400" : "hover:opacity-80"
                }`}
              >
                #{name}
                <span className="text-[10px] opacity-60">{count}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mb-3 text-xs text-slate-400">还没有标签,保存文章/笔记后这里会出现。</p>
        )}

        {selTag ? (
          <div className="rounded-lg bg-terracotta-50/60 p-2.5">
            <p className="mb-2 text-xs font-medium text-slate-700">为「#{selTag}」选择颜色</p>
            <TonePicker value={tagMap[selTag]} onPick={(t) => saveTags({ ...tagMap, [selTag]: t }, `标签「${selTag}」配色已保存`)} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {tagMap[selTag] ? (
                <Button size="sm" variant="ghost" onClick={() => { const n = { ...tagMap }; delete n[selTag]; saveTags(n, "已恢复自动配色"); }}>
                  <RotateCcw className="h-3.5 w-3.5" /> 恢复自动配色
                </Button>
              ) : null}
              <Button size="sm" variant="danger" onClick={() => removeTagEverywhere(selTag)}>
                <Trash2 className="h-3.5 w-3.5" /> 全站删除此标签
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400">↑ 点上方任意标签进行配色或删除</p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="手动指定一个标签名(还不存在也行)" className="h-8 flex-1 text-xs" />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const name = newTag.trim();
              if (!name) return toast.error("先填标签名");
              setSelTag(name);
              setNewTag("");
              if (!tagStats.some(([n]) => n === name)) setTagStats((l) => [[name, 0], ...l]);
            }}
          ><Plus className="h-3.5 w-3.5" /> 指定</Button>
        </div>
      </div>
    </>
  );
}
