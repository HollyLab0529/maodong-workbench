import { useState } from "react";
import { Palette } from "lucide-react";
import { PALETTES, getPaletteId, usePalette } from "../theme";
import { Modal } from "./ui";
import FontPicker from "./FontPicker";

/** 外观切换：侧栏小按钮 + 弹窗（配色 + 标题/正文字体） */
export default function ThemePicker({ className = "", label = "" }) {
  const [open, setOpen] = useState(false);
  const { palette, setPalette } = usePalette();

  // 打开时从 DOM 同步配色（设置页可能刚改过）；字体由 FontPicker 挂载时自读
  const openModal = () => {
    setPalette(getPaletteId());
    setOpen(true);
  };

  return (
    <>
      <button onClick={openModal} title="换外观（配色 / 字体）" className={className}>
        <Palette className="h-4 w-4 shrink-0" />
        {label ? <span>{label}</span> : null}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="外观">
        <div className="space-y-5">
          <section>
            <p className="mb-2 text-xs font-medium text-slate-500">配色</p>
            <div className="grid grid-cols-2 gap-2">
              {PALETTES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPalette(p.id)}
                  className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors ${
                    palette === p.id
                      ? "border-terracotta-400 bg-terracotta-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <span
                    className="flex h-8 w-10 shrink-0 items-end justify-end gap-1 rounded-lg border border-slate-200/70 p-1"
                    style={{ background: p.bg }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.accent }} />
                    <span className="h-2.5 w-2.5 rounded-full border border-slate-200" style={{ background: p.card }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-slate-900">{p.name}</span>
                    <span className="block truncate text-[11px] text-slate-400">{p.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-2 text-xs font-medium text-slate-500">字体</p>
            <FontPicker compact />
          </section>
        </div>
      </Modal>
    </>
  );
}
