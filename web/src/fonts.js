import { useEffect, useState } from "react";

// 标题 / 正文字体各自独立选择；id 对应 index.css 里的 --stack-* 系统字体栈（零下载）
export const TITLE_FONTS = [
  { id: "song", name: "宋体", hint: "衬线，手帐感最强", stack: "--stack-song" },
  { id: "hei", name: "黑体", hint: "利落现代", stack: "--stack-hei" },
  { id: "yuan", name: "圆体", hint: "柔和可爱", stack: "--stack-yuan" },
  { id: "kai", name: "楷体", hint: "像手写笔迹", stack: "--stack-kai" },
];

export const BODY_FONTS = [
  { id: "hei", name: "黑体", hint: "推荐，小字最清晰", stack: "--stack-hei" },
  { id: "song", name: "宋体", hint: "书卷气，看长文略费眼", stack: "--stack-song" },
  { id: "yuan", name: "圆体", hint: "柔和", stack: "--stack-yuan" },
  { id: "kai", name: "楷体", hint: "最手写，小字偏难读", stack: "--stack-kai" },
];

const KT = "wb-font-title";
const KB = "wb-font-body";
const KOLD = "wb-font"; // 旧版单选项，做一次迁移
const LEGACY = { song: ["song", "hei"], hei: ["hei", "hei"], yuan: ["yuan", "yuan"], kai: ["kai", "hei"] };

const pick = (list, id) => (list.some((x) => x.id === id) ? id : list[0].id);

export function getFonts() {
  if (typeof document === "undefined") return { title: "song", body: "hei" };
  const d = document.documentElement.dataset;
  let title = d.fontTitle;
  let body = d.fontBody;
  if (!title || !body) {
    try {
      const old = localStorage.getItem(KOLD);
      if (old && LEGACY[old]) {
        title = title || LEGACY[old][0];
        body = body || LEGACY[old][1];
      }
    } catch {
      /* ignore */
    }
  }
  return { title: pick(TITLE_FONTS, title), body: pick(BODY_FONTS, body) };
}

export function applyFonts({ title, body }) {
  const t = pick(TITLE_FONTS, title);
  const b = pick(BODY_FONTS, body);
  const el = document.documentElement;
  el.dataset.fontTitle = t;
  el.dataset.fontBody = b;
  try {
    localStorage.setItem(KT, t);
    localStorage.setItem(KB, b);
    localStorage.removeItem(KOLD);
  } catch {
    /* ignore */
  }
  return { title: t, body: b };
}

export function useFonts() {
  const [fonts, setFonts] = useState(getFonts);
  useEffect(() => {
    applyFonts(fonts);
  }, [fonts.title, fonts.body]);
  return {
    title: fonts.title,
    body: fonts.body,
    setTitle: (id) => setFonts((f) => ({ ...f, title: id })),
    setBody: (id) => setFonts((f) => ({ ...f, body: id })),
    sync: () => setFonts(getFonts()),
  };
}
