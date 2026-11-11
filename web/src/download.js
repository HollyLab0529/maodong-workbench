// 纯前端下载：把文本存成文件（Markdown / txt 通用）
export function downloadText(filename, text, type = "text/markdown;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 文件名净化：去掉路径/非法字符，避免各系统保存失败
export function safeName(s, fallback = "未命名") {
  const n = String(s || "")
    .trim()
    .replace(/[\\/:*?"<>|\r\n]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 60)
    .trim();
  return n || fallback;
}
