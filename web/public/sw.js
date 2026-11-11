/* 工作台 Service Worker：缓存壳资源，API 请求直连（数据实时性优先） */
const CACHE = "workbench-v21";
const SHELL = [
  "./",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // API / 上传文件永不缓存，保证多端数据一致
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/uploads/")) return;
  if (e.request.method !== "GET") return;
  // 导航请求：网络优先，失败回退缓存（离线可打开壳）
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then((m) => m || caches.match("./")))
    );
    return;
  }
  // 静态资源：缓存优先
  e.respondWith(
    caches.match(e.request).then(
      (m) =>
        m ||
        fetch(e.request).then((res) => {
          if (res.ok && url.origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
    )
  );
});
