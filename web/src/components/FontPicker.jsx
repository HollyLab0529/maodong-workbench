import { TITLE_FONTS, BODY_FONTS, useFonts } from "../fonts";

function Row({ label, list, value, onChange, sample }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-500">{label}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {list.map((f) => {
          const active = value === f.id;
          return (
            <button
              key={f.id}
              onClick={() => onChange(f.id)}
              className={`rounded-lg border px-2 py-1.5 text-left transition-colors ${
                active ? "border-terracotta-400 bg-terracotta-50" : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <span
                className="block truncate text-[13px] leading-tight text-slate-900"
                style={{ fontFamily: `var(${f.stack})` }}
              >
                {sample}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                {f.name} · {f.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 标题 / 正文字体各选一次，即时生效 */
export default function FontPicker({ compact = false }) {
  const { title, body, setTitle, setBody } = useFonts();
  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <Row label="标题字体（页面大标题、板块标题）" list={TITLE_FONTS} value={title} onChange={setTitle} sample="猫冬手帐" />
      <Row label="正文字体（全站正文 / 表单 / 列表）" list={BODY_FONTS} value={body} onChange={setBody} sample="慢慢记，暖暖存 2026" />
      <p className="text-[11px] leading-relaxed text-slate-400">
        全部是设备自带字体，不用下载；正文选宋体/楷体时小字会偏细，看着累就换回黑体。
      </p>
    </div>
  );
}
