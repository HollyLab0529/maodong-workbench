# 参与贡献

谢谢你看这个项目。它最初是「一个人自己用」的工具，所以代码风格偏实用主义——但只要改动不破坏这点，欢迎 PR。

## 本地跑起来

```bash
git clone https://github.com/HollyLab0529/maodong-workbench.git
cd maodong-workbench
npm ci
cd web && npm ci && cd ..
zsh scripts/install-git-hooks.sh   # 装防泄密钩子，务必执行
cd web && npm run build && cd ..   # 前端产物输出到仓库根 public/
PORT=3031 npm start                # 打开 http://localhost:3031
```

改前端时另开一个 `cd web && npm run dev`（Vite HMR，代理到 3031），改完后端要重启 Node。

## 提交前自检

CI 会跑同样的四步，本地先过一遍更快：

```bash
cd web && npm run build && cd ..
for f in $(find server -name '*.js'); do node --check "$f"; done
npm test                                                  # 12 个接口/安全用例，约 10s
DATA_DIR=$(mktemp -d) PORT=3031 node server/index.js &    # 冒烟：/api/health 返回 ok
```

新增接口或动到鉴权、字段白名单、导出时，请同步补 `test/api.test.js` 的用例。

## 代码约定

1. **新增一个数据集合必须同改三处**，否则接口会 500 或前端取到 `undefined`：
   - `server/index.js` 的 `COLLECTIONS`（字段白名单，`/api/data` 与 `/api/v1` 共用）
   - `server/index.js` 的 `API_COLLECTIONS`（开放 API 可访问的集合）
   - `server/store.js` 的 `DEFAULT_DB`（新库初始化，缺了会 `push of undefined`）
2. **写数据一律走 `store.js` 的 `tx()`**（串行写事务 + 原子落盘），不要直接读写 JSON 文件。
3. 前端所有请求走 `web/src/api.js`，不要手写 `fetch`；跨端刷新用 `useLiveReload`。
4. **Markdown 渲染必须用 `MarkdownLite`**，它的根节点带 `md-body` 类——`.md-body h2/h3` 的层级样式挂在这个类上，漏了就只有一片灰字。
5. 配色走主题变量（`rgb(var(--t400))`）或已有 tint 映射，不要新写死十六进制色值，否则切换配色时会打架。
6. 新增模块要登记到 `web/src/modules.js`（模块超市/侧栏靠它渲染），图标用 `lucide-react`。

## 绝对不要提交的东西

`data/`、`*.db`、`.env*`、`.assistant-token`、`.workbench-token`、`deploy/deploy.local.sh`（含服务器地址与密钥路径）。

仓库自带的 pre-commit 钩子会拦这些（`scripts/install-git-hooks.sh` 安装）。如果你确实要提交样本数据，用 `WB_ALLOW_DATA=1 git commit ...` 单次放行，并确认里面没有真实个人信息。

## 提交信息

`feat: 简述` / `fix: 简述` / `docs: 简述` / `chore: 简述`，正文说清「为什么改」。一个 PR 只做一件事。

## PR 前

- 描述里写：解决什么问题、怎么验证的（截图/命令输出都行）
- 涉及 UI 的附一张截图（记得打码个人信息）
- 别顺手重构无关文件——这个仓库的 diff 越干净越好审
