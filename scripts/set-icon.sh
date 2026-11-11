#!/bin/zsh
# 用自己手搓的图替换全部应用图标（PWA + iOS + favicon）
#
# 用法：
#   zsh scripts/set-icon.sh ~/Desktop/my-cat.png
#
# 输入要求：正方形、PNG/JPG、建议 1024×1024（最小 512×512）
# 脚本会自动缩放成三档并升级 Service Worker 缓存版本，然后可用 deploy/deploy.sh 发布。
set -e

SRC="$1"
if [ -z "$SRC" ] || [ ! -f "$SRC" ]; then
  echo "用法: zsh scripts/set-icon.sh <图片路径>"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUB="$ROOT/web/public"

W=$(sips -g pixelWidth "$SRC" | awk '/pixelWidth/ {print $2}')
H=$(sips -g pixelHeight "$SRC" | awk '/pixelHeight/ {print $2}')
if [ "$W" != "$H" ]; then
  echo "❌ 图片不是正方形（${W}×${H}）。请先裁成 1:1，否则图标会被拉伸。"
  exit 1
fi
if [ "$W" -lt 512 ]; then
  echo "⚠️  原图只有 ${W}px，建议至少 512px，否则大图标会模糊。"
fi

echo "==> 源图 ${W}×${H}，开始生成三档…"
sips -s format png -z 512 512 "$SRC" --out "$PUB/icon-512.png" >/dev/null
sips -s format png -z 192 192 "$SRC" --out "$PUB/icon-192.png" >/dev/null
sips -s format png -z 180 180 "$SRC" --out "$PUB/apple-touch-icon.png" >/dev/null

# 升级 SW 缓存版本，老设备才会换新图标
node -e '
const fs = require("fs");
const p = process.argv[1];
const s = fs.readFileSync(p, "utf8");
const next = s.replace(/const CACHE = "workbench-v(\d+)"/, (_, v) => `const CACHE = "workbench-v${Number(v) + 1}"`);
fs.writeFileSync(p, next);
console.log("SW 缓存版本 →", (next.match(/workbench-v\d+/) || [])[0]);
' "$PUB/sw.js"

echo "✅ 图标已替换：icon-512.png / icon-192.png / apple-touch-icon.png"
echo "   下一步：zsh deploy/deploy.sh 发布；手机端 PWA 需删除重装才会更新图标。"
