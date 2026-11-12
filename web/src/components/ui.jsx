import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Check, Loader2 } from "lucide-react";
import CatMascot from "./CatMascot";

const toastListeners = new Set();

export function toast(message, type = "success") {
  toastListeners.forEach((fn) =>
    fn({ id: Math.random().toString(36).slice(2), message, type })
  );
}
toast.error = (m) => toast(m, "error");
toast.success = (m) => toast(m, "success");

export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const fn = (t) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== t.id)), 2800);
    };
    toastListeners.add(fn);
    return () => toastListeners.delete(fn);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex w-full max-w-xs -translate-x-1/2 flex-col gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className={`rounded-xl px-4 py-2.5 text-center text-sm shadow-soft ${
            t.type === "error"
              ? "bg-red-500 text-white"
              : "bg-slate-900 text-slate-50"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  ...props
}) {
  const variants = {
    primary: "bg-terracotta text-white hover:bg-terracotta-600 shadow-sm",
    outline: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    ghost: "text-slate-500 hover:bg-slate-100",
    subtle: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    danger: "text-red-500 hover:bg-red-50",
  };
  const sizes = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-3.5 py-2 text-sm",
    lg: "px-5 py-2.5 text-sm",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Input({ className = "", ...props }) {
  return (
    <input
      className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300 focus:border-terracotta-400 focus:outline-none focus:ring-2 focus:ring-terracotta-100 ${className}`}
      {...props}
    />
  );
}

export function Textarea({ className = "", rows = 4, autoGrow = false, value, onInput, ...props }) {
  const ref = useRef(null);
  // autoGrow：随内容自动增高（最少 rows 行），长内容不用手动拖拽
  const resize = () => {
    const el = ref.current;
    if (autoGrow && el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  };
  useEffect(resize, [value, autoGrow]);
  return (
    <textarea
      ref={ref}
      rows={autoGrow ? 3 : rows}
      className={`w-full resize-y overflow-hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 placeholder:text-slate-300 focus:border-terracotta-400 focus:outline-none focus:ring-2 focus:ring-terracotta-100 ${className}`}
      {...props}
      value={value}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
    />
  );
}

export function Label({ children }) {
  return <span className="mb-1.5 block text-xs font-medium text-slate-500">{children}</span>;
}

export function Badge({ children, className = "" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 ${className}`}
    >
      {children}
    </span>
  );
}

export function Checkbox({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
        checked
          ? "border-terracotta bg-terracotta text-white"
          : "border-slate-300 bg-white hover:border-terracotta-400"
      }`}
      style={{ height: "18px", width: "18px" }}
    >
      {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
    </button>
  );
}

export function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  // Portal 到 body：避免被祖先的 transform/animation 容器锚定，遮罩必须盖满全屏
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative max-h-[88vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl ${
          wide ? "sm:max-w-2xl" : "sm:max-w-md"
        }`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-500">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function EmptyState({ icon: Icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 py-14 text-center text-slate-400">
      {Icon ? <Icon className="mb-3 h-9 w-9 text-slate-300" /> : null}
      <p className="max-w-xs text-sm leading-relaxed">{text}</p>
      {/* 品牌点缀：趴着的小猫线稿 */}
      <CatMascot className="mt-4 h-10 w-auto text-slate-200" />
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-20 text-sm text-slate-400">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载中…
    </div>
  );
}
