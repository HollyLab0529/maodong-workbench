import { useCallback, useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { listRows, insertRow, updateRow } from "../api";

/**
 * 四宫格尺寸记忆：每格可手动拖动右下角调整宽/高，尺寸存进 settings 集合。
 * - 宽度按容器百分比存（24% ~ 100%），拖动时吸附到 25 / 33.3 / 50 / 66.7 / 75 / 100
 * - 高度按 px 存，未拖过则为 auto（不写 minHeight）
 * - 手机上格子固定整行，手柄隐藏（窄屏拖动体验差）
 */

const MIN_W = 24;
const SNAP_W = [25, 33.33, 50, 66.67, 75, 100];
const MIN_H = 90;

export function useQuadLayout(settingsKey) {
  const [sizes, setSizes] = useState({});
  const sizesRef = useRef(sizes);
  const rowIdRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => { sizesRef.current = sizes; }, [sizes]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const settings = await listRows("settings").catch(() => []);
      if (!alive) return;
      const row = settings.find((s) => s.key === settingsKey);
      if (!row) return;
      rowIdRef.current = row.id;
      try {
        const parsed = JSON.parse(row.value || "{}");
        if (parsed && typeof parsed === "object") setSizes(parsed);
      } catch {
        /* 布局解析失败就用默认 */
      }
    })();
    return () => { alive = false; };
  }, [settingsKey]);

  const persist = useCallback(
    async (next) => {
      try {
        const value = JSON.stringify(next);
        if (rowIdRef.current) {
          await updateRow("settings", rowIdRef.current, { value });
        } else {
          const saved = await insertRow("settings", { key: settingsKey, value });
          const id = saved?.id ?? saved?.row?.id ?? null;
          if (id) rowIdRef.current = id;
        }
      } catch {
        /* 静默：布局存不上不影响使用 */
      }
    },
    [settingsKey]
  );

  const startResize = useCallback(
    (e, id, containerEl) => {
      if (window.innerWidth < 768) return;
      e.preventDefault();
      e.stopPropagation();
      const card = e.currentTarget.parentElement;
      const cw = containerEl?.clientWidth || 800;
      drag.current = {
        id,
        x: e.clientX,
        y: e.clientY,
        w: sizesRef.current[id]?.w ?? 50,
        h: sizesRef.current[id]?.h ?? card?.offsetHeight ?? 0,
        cw,
      };

      const move = (ev) => {
        const d = drag.current;
        if (!d) return;
        const rawW = Math.min(100, Math.max(MIN_W, d.w + ((ev.clientX - d.x) / d.cw) * 100));
        let w = Math.round(rawW);
        SNAP_W.forEach((s) => {
          if (Math.abs(rawW - s) <= 2.5) w = s;
        });
        const h = Math.max(MIN_H, Math.round((d.h + (ev.clientY - d.y)) / 5) * 5);
        const next = { ...sizesRef.current, [d.id]: { w, h } };
        sizesRef.current = next; // 同步写 ref，保证松手时持久化的是最新值
        setSizes(next);
      };

      const up = () => {
        drag.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        persist(sizesRef.current);
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [persist]
  );

  const resetSize = useCallback(
    (id) => {
      const next = { ...sizesRef.current };
      delete next[id];
      sizesRef.current = next;
      setSizes(next);
      persist(next);
    },
    [persist]
  );

  return { sizes, startResize, resetSize };
}

/** 格子外层样式：宽高都走 CSS 变量 / inline，手机上整行 */
export const quadStyle = (size) => ({
  "--qcard-w": `calc(${size?.w ?? 50}% - 8px)`,
  ...(size?.h ? { minHeight: size.h } : {}),
});

export const quadClass = "relative grid w-full shrink-0 md:w-[var(--qcard-w)]";

/** 右下角拖拽手柄：按住拖宽度和高度，双击恢复默认 */
export function ResizeHandle({ onPointerDown, onDoubleClick }) {
  return (
    <div
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      title="拖动调整大小，双击恢复默认"
      className="absolute bottom-0 right-0 hidden h-5 w-5 cursor-nwse-resize touch-none select-none items-end justify-end p-1 text-slate-300 opacity-0 transition-opacity hover:text-terracotta group-hover:opacity-100 md:flex"
      style={{ cursor: "nwse-resize" }}
    >
      <GripVertical className="h-3.5 w-3.5 rotate-45" />
    </div>
  );
}
