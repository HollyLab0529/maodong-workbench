#!/bin/zsh
# 安装仓库自带的 git hooks 到 .git/hooks/（幂等，可重复执行）
# 用法：zsh scripts/install-git-hooks.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

for hook in pre-commit pre-push; do
  src="scripts/git-hooks/$hook"
  dst=".git/hooks/$hook"
  [ -f "$src" ] || { echo "缺少 $src"; exit 1; }
  cp "$src" "$dst"
  chmod +x "$dst"
  echo "已安装 $dst"
done

echo "完成。pre-commit 拦截 data/·令牌·deploy.local.sh，pre-push 在推 main 前跑 check-sensitive.sh。"
echo "确需放行时：WB_ALLOW_DATA=1 git commit ...（pre-commit 单次放行）"
