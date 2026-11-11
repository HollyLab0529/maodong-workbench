// 生成 PWA 图标：复古 ins 风 —— 米纸底 + 胶片颗粒 + 砖红圆徽 + 奶油小猫
// 配色取自作品集：纸 #EFE9E0 / 砖红 #9C3B36 / 奶油 #F6F2EA / 腮红 #EFC9BF
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "..", "web", "public");
mkdirSync(OUT, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(size, pixelFn) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = a === undefined ? 255 : a;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- 几何工具 ----------
const PAPER = [0xef, 0xe9, 0xe0];
const BRICK = [0x9c, 0x3b, 0x36];
const CREAM = [0xf6, 0xf2, 0xea];
const BLUSH = [0xef, 0xc9, 0xbf];

const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

function inTri(x, y, p1, p2, p3) {
  const s = (a, b) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  const d1 = s(p1, p2), d2 = s(p2, p3), d3 = s(p3, p1);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function segDist(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((x - x1) * dx + (y - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

// 圆弧环带（角度为标准数学角，a0<a1，处理 2π 环绕）
function inArc(x, y, cx, cy, R, w, a0, a1) {
  const dx = x - cx, dy = y - cy;
  const r = Math.hypot(dx, dy);
  if (r < R - w / 2 || r > R + w / 2) return false;
  let ang = Math.atan2(dy, dx);
  if (ang < 0) ang += 2 * Math.PI;
  let lo = a0, hi = a1;
  if (lo < 0) lo += 2 * Math.PI;
  if (hi < 0) hi += 2 * Math.PI;
  if (hi >= lo) return ang >= lo && ang <= hi;
  return ang >= lo || ang <= hi; // 跨 0 点
}

// 确定性伪随机（胶片颗粒）
const hash2 = (x, y) => {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

function draw(size) {
  const s = size / 512;
  const cx = 256 * s, cy = 266 * s;
  const badgeR = 204 * s;
  const headR = 118 * s;
  const headY = 296 * s;
  // 耳朵（三角）
  const earL = [[176 * s, 146 * s], [188 * s, 238 * s], [282 * s, 198 * s]];
  const earR = [[336 * s, 146 * s], [324 * s, 238 * s], [230 * s, 198 * s]];
  // 眯眼（∩ 弧）：标准角 π..2π 是上半圆
  const eyeR = 24 * s, eyeW = 11 * s;
  const eyes = [[210 * s, 290 * s], [302 * s, 290 * s]];
  const eyeA0 = Math.PI * 1.12, eyeA1 = Math.PI * 1.88;
  // 鼻子（小三角）+ ω 嘴
  const nose = [[242 * s, 318 * s], [270 * s, 318 * s], [256 * s, 337 * s]];
  const mouthR = 13 * s, mouthW = 7 * s;
  const mouths = [[239 * s, 344 * s], [273 * s, 344 * s]];
  const mouthA0 = Math.PI * 1.08, mouthA1 = Math.PI * 1.92;
  // 腮红
  const blush = [[172 * s, 328 * s, 17 * s], [340 * s, 328 * s, 17 * s]];
  // 胡须（画在砖红徽章上，奶油色）
  const whiskers = [
    [150 * s, 284 * s, 88 * s, 270 * s],
    [146 * s, 306 * s, 82 * s, 306 * s],
    [150 * s, 328 * s, 88 * s, 342 * s],
    [362 * s, 284 * s, 424 * s, 270 * s],
    [366 * s, 306 * s, 430 * s, 306 * s],
    [362 * s, 328 * s, 424 * s, 342 * s],
  ];
  const whiskerW = 6 * s;

  return (x, y) => {
    // 1) 纸底 + 胶片颗粒（颗粒只落在纸底上）
    const g = hash2(x, y) - 0.5;
    const grainAmt = 10;
    let c = [
      Math.max(0, Math.min(255, PAPER[0] + g * grainAmt)),
      Math.max(0, Math.min(255, PAPER[1] + g * grainAmt)),
      Math.max(0, Math.min(255, PAPER[2] + g * grainAmt)),
    ];

    // 2) 砖红圆徽章
    if (inCircle(x, y, cx, cy, badgeR)) {
      c = [...BRICK];
      // 徽章内一圈奶油细描边（复古贴纸感）
      if (Math.abs(Math.hypot(x - cx, y - cy) - (badgeR - 14 * s)) < 3 * s) {
        c = [...CREAM];
      }
    }

    // 3) 胡须（奶油，画在徽章上）
    for (const w of whiskers) {
      if (segDist(x, y, w[0], w[1], w[2], w[3]) <= whiskerW / 2) {
        c = [...CREAM];
      }
    }

    // 4) 耳朵 + 头（奶油）
    if (inTri(x, y, ...earL) || inTri(x, y, ...earR) || inCircle(x, y, cx, headY, headR)) {
      c = [...CREAM];
    }

    // 5) 腮红
    for (const b of blush) {
      if (inCircle(x, y, b[0], b[1], b[2])) c = [...BLUSH];
    }

    // 6) 眯眼 ∩、ω 嘴、鼻子（砖红）
    for (const e of eyes) {
      if (inArc(x, y, e[0], e[1], eyeR, eyeW, eyeA0, eyeA1)) c = [...BRICK];
    }
    for (const m of mouths) {
      if (inArc(x, y, m[0], m[1], mouthR, mouthW, mouthA0, mouthA1)) c = [...BRICK];
    }
    if (inTri(x, y, ...nose)) c = [...BRICK];

    return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), 255];
  };
}

for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  writeFileSync(join(OUT, name), encodePNG(size, draw(size)));
  console.log("生成", name);
}
