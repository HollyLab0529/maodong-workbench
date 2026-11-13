#!/bin/zsh
# 猫冬手帐一键部署模板:备份服务器数据 → 构建前端 → rsync 上传 → 重启 → 健康检查
#
# 用法:先把真实配置写进 deploy/deploy.local.sh(已被 .gitignore 排除,不会入库):
#   SERVER="root@你的服务器IP"
#   KEY="$HOME/.ssh/你的密钥"
#   REMOTE_DIR="/opt/workbench"
# 然后执行: zsh deploy/deploy.sh
#
# 部署前会自动把服务器上的 data/ 与 public/ 打包到 $BACKUP_DIR(默认 REMOTE_DIR 同级的
# workbench-backups,保留最近 10 份,含 .secret 与上传文件,只留在服务器上不入库)。
# 出问题用: zsh deploy/rollback.sh
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
# 备份放在 REMOTE_DIR 之外,否则会被 rsync --delete 清掉
BACKUP_DIR="${BACKUP_DIR:-${REMOTE_DIR%/*}/workbench-backups}"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
TS="$(date +%Y%m%d-%H%M%S)"
ssh_run() { ssh -i "$KEY" -o BatchMode=yes "$SERVER" "$@"; }

echo "==> 1/5 备份服务器数据与当前产物…"
ssh_run "mkdir -p $BACKUP_DIR && cd $REMOTE_DIR \
  && tar czf $BACKUP_DIR/deploy-$TS.tgz data \$( [ -d public ] && echo public ) \
  && (git config --global --get-all safe.directory | grep -qx \"$REMOTE_DIR\" || git config --global --add safe.directory $REMOTE_DIR 2>/dev/null; git rev-parse HEAD > $BACKUP_DIR/deploy-$TS.sha 2>/dev/null || echo unknown > $BACKUP_DIR/deploy-$TS.sha) \
  && (ls -1t $BACKUP_DIR/deploy-*.tgz 2>/dev/null | tail -n +$((KEEP_BACKUPS+1)) | while read f; do rm -f \"\$f\" \"\${f%.tgz}.sha\"; done)"
echo "    备份: $BACKUP_DIR/deploy-$TS.tgz"

echo "==> 2/5 构建前端…"
(cd web && npm run build)

echo "==> 3/5 同步代码到服务器…"
ssh_run "mkdir -p $REMOTE_DIR/data"
rsync -az --delete -e "ssh -i $KEY -o BatchMode=yes" \
  --exclude "web/node_modules" \
  --exclude "web/.vite" \
  --exclude "data/" \
  --exclude "deploy/deploy.local.sh" \
  --exclude ".DS_Store" \
  --exclude "public/" \
  ./ "$SERVER:$REMOTE_DIR/"
rsync -az -e "ssh -i $KEY -o BatchMode=yes" ./public/ "$SERVER:$REMOTE_DIR/public/"

echo "==> 4/5 安装依赖并重启服务…"
ssh_run "cd $REMOTE_DIR && npm install --omit=dev >/dev/null 2>&1 \
  && sed \"s/__PORT__/$PORT/\" deploy/workbench.service.tpl > /etc/systemd/system/workbench.service \
  && systemctl daemon-reload && systemctl enable workbench >/dev/null 2>&1 \
  && systemctl restart workbench"

echo "==> 5/5 健康检查…"
sleep 1.5
if ssh_run "curl -sf http://127.0.0.1:$PORT/api/health" >/dev/null; then
  echo "✅ 部署完成(备份 deploy-$TS.tgz)"
else
  echo "❌ 健康检查失败。回滚命令:"
  echo "   zsh deploy/rollback.sh data $TS   # 只恢复数据"
  echo "   zsh deploy/rollback.sh code $TS   # 只回退代码与前端产物"
  echo "   zsh deploy/rollback.sh all  $TS   # 全量回滚"
  exit 1
fi
