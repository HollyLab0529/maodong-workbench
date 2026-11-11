#!/bin/zsh
# 把 dev 的更新同步到公开仓(GitHub):合并 → 敏感扫描 → 推送 → 回到 dev
set -e
cd "$(dirname "$0")/.."

[ "$(git branch --show-current)" = "dev" ] || { echo "❌ 请在 dev 分支运行"; exit 1; }
if git status --short | grep -q .; then
  echo "❌ 有未提交的改动,先 commit 或 stash:"; git status --short; exit 1
fi

echo "==> 合并 dev → main…"
git checkout main
if ! git merge dev --no-edit; then
  echo "⚠️ 合并有冲突:手动解决后执行 git add + git commit,再重新运行本脚本"
  exit 1
fi

echo "==> 敏感信息扫描…"
zsh scripts/check-sensitive.sh main

echo "==> 推送到公开仓…"
git push public main

git checkout dev
echo "✅ 已同步到 GitHub 公开仓,当前回到 dev 分支"
