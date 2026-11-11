#!/bin/zsh
# 猫冬手帐一键部署模板:构建前端 → rsync 上传 → 重启服务 → 健康检查
#
# 用法:先把真实配置写进 deploy/deploy.local.sh(已被 .gitignore 排除,不会入库):
#   SERVER="root@你的服务器IP"
#   KEY="$HOME/.ssh/你的密钥"
#   REMOTE_DIR="/opt/workbench"
# 然后执行: zsh deploy/deploy.sh
set -e
cd "$(dirname "$0")/.."

# 本地私有配置(不入库)
if [ -f deploy/deploy.local.sh ]; then
  source deploy/deploy.local.sh
else
  echo "❌ 缺少 deploy/deploy.local.sh,请按文件头注释创建(含 SERVER/KEY/REMOTE_DIR)"
  exit 1
fi
: "${SERVER:?未配置 SERVER}" "${KEY:?未配置 KEY}" "${REMOTE_DIR:=/opt/workbench}"

PORT="${PORT:-3031}"

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
ssh -i "$KEY" -o BatchMode=yes "$SERVER" "cd $REMOTE_DIR && npm install --omit=dev >/dev/null 2>&1 \
  && sed \"s/__PORT__/$PORT/\" deploy/workbench.service.tpl > /etc/systemd/system/workbench.service \
  && systemctl daemon-reload && systemctl enable workbench >/dev/null 2>&1 \
  && systemctl restart workbench"

echo "==> 4/4 健康检查…"
sleep 1.5
ssh -i "$KEY" -o BatchMode=yes "$SERVER" "curl -sf http://127.0.0.1:$PORT/api/health" && echo && echo "✅ 部署完成"
