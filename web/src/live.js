import { useEffect, useRef } from "react";

/* SSE 实时同步：多端共享一个 EventSource，收到版本变化通知各页面重新加载 */
let es = null;
let serverVersion = null;
const listeners = new Set();
let online = true;

function connect() {
  if (es || typeof window === "undefined") return;
  try {
    es = new EventSource("/api/events");
  } catch {
    es = null;
    return;
  }
  es.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      if (typeof d.v === "number") {
        const first = serverVersion === null;
        const changed = !first && d.v !== serverVersion;
        serverVersion = d.v;
        if (changed) listeners.forEach((fn) => fn());
      }
    } catch {
      /* ignore */
    }
  };
  es.onerror = () => {
    es.close();
    es = null;
    setTimeout(connect, 3000);
  };
}

window.addEventListener("online", () => {
  online = true;
  connect();
});
window.addEventListener("offline", () => {
  online = false;
});

export function isLiveConnected() {
  return !!es && online;
}

/** 页面数据变化时自动刷新（其他设备/标签页写入也会触发） */
export function useLiveReload(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    connect();
    const handler = () => ref.current();
    listeners.add(handler);
    return () => listeners.delete(handler);
  }, []);
}
