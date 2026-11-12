#!/bin/zsh
# 敏感信息检查:推公开分支(main)前扫描已提交内容中的个人信息/服务器信息
# 用法: zsh scripts/check-sensitive.sh [commit-sha]   默认扫 HEAD
# 命中即退出码 1,并在 pre-push 钩子中拦截推送

SHA="${1:-HEAD}"
# 允许名单:LICENSE 里的版权署名是刻意的
ALLOW='^(LICENSE)'

PATTERNS=(
  'hollylab\.cloud'          # 个人域名（仓库 GitHub 地址 HollyLab0529 不在此列）
  'xuxiaohan'                # 个人 MIS/用户名
  '徐笑晗'                    # 真实姓名
  '124\.222\.228\.104'       # 服务器 IP
  'workbench_key'            # SSH 私钥路径
)

FOUND=0
for p in "${PATTERNS[@]}"; do
  hits=$(git grep -I -i -E "$p" "$SHA" -- . ':(exclude)LICENSE' ':(exclude)scripts/' ':(exclude)AGENTS.md' ':(exclude)docs/DEPLOY.md' 2>/dev/null)
  if [ -n "$hits" ]; then
    echo "❌ 检测到敏感信息 [$p]:"
    echo "$hits" | head -10
    FOUND=1
  fi
done

if [ "$FOUND" -eq 1 ]; then
  echo ""
  echo "⛔ 公开分支包含疑似个人信息/服务器信息,推送已拦截。"
  echo "   请清理后再推,或确认是误报时修改 scripts/check-sensitive.sh 的白名单。"
  exit 1
fi

echo "✅ 敏感信息检查通过($SHA)"
exit 0
