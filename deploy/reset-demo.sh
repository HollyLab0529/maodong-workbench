#!/bin/sh
# 演示站每日重置：重新生成一套虚构样例数据，让访客任何时候点开都是完整的样子。
# 由 crontab 每天 04:00 调用：
#   0 4 * * * /opt/workbench-demo/deploy/reset-demo.sh >> /var/log/workbench-demo-reset.log 2>&1
#
# 顺序有意为之：先停服务再写文件——服务把 db.json 常驻在内存里，
# 边跑边改文件会被它下一次写入覆盖掉。
set -e
DIR="${REMOTE_DIR:-/opt/workbench-demo}"
NODE_BIN="${NODE_BIN:-/usr/local/bin/node}"

echo "[$(date '+%F %T')] 开始重置演示数据"
systemctl stop workbench-demo || true
cd "$DIR"
DEMO_MODE=1 DATA_DIR="$DIR/data" "$NODE_BIN" scripts/seed_demo.js
systemctl start workbench-demo
sleep 1
if curl -sf "http://127.0.0.1:${PORT:-3032}/api/health" > /dev/null; then
  echo "[$(date '+%F %T')] 重置完成，服务健康"
else
  echo "[$(date '+%F %T')] ❌ 重置后健康检查失败，请查 journalctl -u workbench-demo -n 50"
  exit 1
fi
