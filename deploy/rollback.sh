#!/bin/zsh
# 猫冬手帐回滚脚本:用 deploy.sh 生成的服务器备份恢复到指定批次
#
# 用法:
#   zsh deploy/rollback.sh                 # 列出可用备份
#   zsh deploy/rollback.sh data            # 恢复最新备份的数据(不动代码)
#   zsh deploy/rollback.sh code            # 回退最新备份之前的代码与前端产物(不动数据)
#   zsh deploy/rollback.sh all             # 两者都恢复
#   zsh deploy/rollback.sh data 20261112-120000   # 指定备份批次
#
# 备份由 deploy.sh 在部署前生成:deploy-<批次>.tgz(含 data/ 与 public/)+ deploy-<批次>.sha(代码版本)
set -e
cd "$(dirname "$0")/.."

if [ -f deploy/deploy.local.sh ]; then
  source deploy/deploy.local.sh
else
  echo "❌ 缺少 deploy/deploy.local.sh"
  exit 1
fi
: "${SERVER:?未配置 SERVER}" "${KEY:?未配置 KEY}" "${REMOTE_DIR:=/opt/workbench}"

PORT="${PORT:-3031}"
BACKUP_DIR="${BACKUP_DIR:-${REMOTE_DIR%/*}/workbench-backups}"
ssh_run() { ssh -i "$KEY" -o BatchMode=yes "$SERVER" "$@"; }

ACTION="${1:-list}"
TS="${2:-}"

if [ "$ACTION" = "list" ] || [ -z "$ACTION" ]; then
  echo "==> 可用备份:$BACKUP_DIR"
  ssh_run "ls -lht $BACKUP_DIR/deploy-*.tgz 2>/dev/null | head -20 || echo '   (暂无备份)'"
  echo
  echo "用法: zsh deploy/rollback.sh {data|code|all} [批次号,默认最新]"
  exit 0
fi

# 未指定批次 → 取最新一份
if [ -z "$TS" ]; then
  TS="$(ssh_run "ls -1t $BACKUP_DIR/deploy-*.tgz 2>/dev/null | head -1 | sed -E 's#.*deploy-([0-9-]+)\\.tgz#\\1#'")"
  [ -z "$TS" ] && { echo "❌ 没有可用备份"; exit 1; }
fi

echo "==> 使用备份批次: $TS"

case "$ACTION" in
  data)
    echo "==> 停服 → 存档当前数据 → 恢复备份数据 → 起服"
    ssh_run "systemctl stop workbench \
      && cd $REMOTE_DIR \
      && mkdir -p data/backups \
      && tar czf data/backups/prerollback-\$(date +%Y%m%d-%H%M%S).tgz data/db.json 2>/dev/null || true \
      && tar xzf $BACKUP_DIR/deploy-$TS.tgz data \
      && systemctl start workbench"
    ;;
  code)
    echo "==> 停服 → 回退代码到 $TS 之前的版本 → 恢复前端产物 → 起服"
    ssh_run "set -e; cd $REMOTE_DIR; git config --global --replace-all safe.directory $REMOTE_DIR 2>/dev/null || true; \
      SHA=\$(cat $BACKUP_DIR/deploy-$TS.sha 2>/dev/null); \
      if [ -n \"\$SHA\" ] && [ \"\$SHA\" != \"unknown\" ] && [ -d .git ]; then \
        git checkout -f \"\$SHA\"; echo \"    代码已回退到 \$SHA\"; \
      else echo '    ⚠️ 无 git 版本信息,仅恢复前端产物(代码请用 git checkout 后重跑 deploy.sh)'; fi; \
      systemctl stop workbench \
      && tar xzf $BACKUP_DIR/deploy-$TS.tgz public \
      && systemctl start workbench"
    ;;
  all)
    echo "==> 停服 → 回退代码 → 恢复数据与前端产物 → 起服"
    ssh_run "set -e; cd $REMOTE_DIR; git config --global --replace-all safe.directory $REMOTE_DIR 2>/dev/null || true; \
      SHA=\$(cat $BACKUP_DIR/deploy-$TS.sha 2>/dev/null); \
      if [ -n \"\$SHA\" ] && [ \"\$SHA\" != \"unknown\" ] && [ -d .git ]; then git checkout -f \"\$SHA\"; fi; \
      systemctl stop workbench; \
      tar xzf $BACKUP_DIR/deploy-$TS.tgz; \
      systemctl start workbench"
    ;;
  *)
    echo "❌ 未知动作: $ACTION(可用: data|code|all|list)"
    exit 1
    ;;
esac

echo "==> 健康检查…"
sleep 1.5
if ssh_run "curl -sf http://127.0.0.1:$PORT/api/health" >/dev/null; then
  echo "✅ 回滚完成($ACTION,批次 $TS)"
else
  echo "❌ 回滚后健康检查失败,请人工介入: ssh $SERVER 'systemctl status workbench; journalctl -u workbench -n 50'"
  exit 1
fi
