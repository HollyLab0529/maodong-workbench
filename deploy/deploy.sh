#!/bin/zsh
# 自建工作台一键部署：构建前端 → rsync 上传 → 重启服务 → 健康检查
# 用法: zsh deploy/deploy.sh
set -e
cd "$(dirname "$0")/.."

SERVER="root@124.222.228.104"
KEY="$HOME/.ssh/workbench_key"
REMOTE_DIR="/opt/workbench"

echo "==> 1/4 构建前端…"
(cd web && npm run build)

echo "==> 2/4 同步代码到服务器…"
ssh -i "$KEY" -o BatchMode=yes "$SERVER" "mkdir -p $REMOTE_DIR/data"
rsync -az --delete -e "ssh -i $KEY -o BatchMode=yes" \
  --exclude "web/node_modules" \
  --exclude "web/.vite" \
  --exclude "data/" \
  --exclude ".DS_Store" \
  --exclude "public/" \
  ./ "$SERVER:$REMOTE_DIR/"
rsync -az -e "ssh -i $KEY -o BatchMode=yes" ./public/ "$SERVER:$REMOTE_DIR/public/"

echo "==> 3/4 安装依赖并重启服务…"
ssh -i "$KEY" -o BatchMode=yes "$SERVER" "cd $REMOTE_DIR && npm install --omit=dev --registry=https://registry.npmmirror.com >/dev/null 2>&1 \
  && cp -f $REMOTE_DIR/deploy/workbench.service /etc/systemd/system/workbench.service \
  && systemctl daemon-reload && systemctl enable workbench >/dev/null 2>&1 \
  && systemctl restart workbench"

echo "==> 4/4 健康检查…"
sleep 1.5
ssh -i "$KEY" -o BatchMode=yes "$SERVER" "curl -sf http://127.0.0.1:3031/api/health" && echo && echo "✅ 部署完成"
