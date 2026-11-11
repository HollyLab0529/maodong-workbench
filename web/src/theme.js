import { useEffect, useState } from "react";

// 5 套配色：id 对应 index.css 里的 [data-palette="..."] 变量块
export const PALETTES = [
  { id: "paper", name: "复古纸", hint: "作品集同款", accent: "#9C3B36", bg: "#EFE9E0", card: "#FCFAF4" },
  { id: "clay", name: "陶土橙", hint: "暖阳", accent: "#E06B45", bg: "#FBF7F1", card: "#FFFDFA" },
  { id: "forest", name: "橄榄绿", hint: "清爽", accent: "#75865A", bg: "#F0F1E7", card: "#FAFBF5" },
  { id: "ocean", name: "雾灰蓝", hint: "安静", accent: "#52708F", bg: "#EDF0F4", card: "#FAFBFD" },
  { id: "plum", name: "豆沙粉", hint: "温柔", accent: "#A05A6E", bg: "#F5EFF1", card: "#FDFAFB" },
];

const KEY = "wb-palette";

export function getPaletteId() {
  if (typeof document === "undefined") return "paper";
  return document.documentElement.dataset.palette || "paper";
}

export function applyPalette(id) {
  const p = PALETTES.find((x) => x.id === id) || PALETTES[0];
  document.documentElement.dataset.palette = p.id;
  try {
    localStorage.setItem(KEY, p.id);
  } catch {
    /* ignore */
  }
  // 同步移动端状态栏颜色与浏览器主题色
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", p.accent);
  return p.id;
}

export function usePalette() {
  const [palette, setPalette] = useState(getPaletteId);
  useEffect(() => {
    applyPalette(palette);
  }, [palette]);
  return { palette, setPalette };
}
