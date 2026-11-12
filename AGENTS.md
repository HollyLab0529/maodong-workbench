# AGENTS.md · 给 Agent 的部署手册

这份文件是写给 **AI Agent / 自动化脚本** 读的：拿到仓库后照着执行即可。
人类读者请先看 [`docs/DEPLOY.md`](docs/DEPLOY.md)，那份更友好。

---

## 0. 一句话理解这个项目

单进程 Node 服务：Express 提供 `/api/*`，同时托管 `public/` 里的 React SPA 构建产物；
**全部数据存在一个 JSON 文件**（`$DATA_DIR/db.json`），没有数据库、没有 Redis、没有外部依赖。

```
server/        Express 入口(index.js)、AI 解析(ai.js)、JSON 存储与写事务(store.js)
web/           React + Vite 源码；npm run build 输出到仓库根的 public/
public/        前端构建产物（git 忽略，必须构建后才存在）
deploy/        deploy.sh（rsync 部署模板）、workbench.service.tpl（systemd 单元）
data/          运行时数据（git 忽略）★ 这是唯一有状态的东西
```

## 1. 硬约束（违反会出事）

1. **绝不提交 `data/`、`*.db`、`.env*`、`.assistant-token`、`.workbench-token`** —— 里面有真实用户数据与令牌
2. 部署/更新时**不要覆盖目标机的 `data/` 目录**（rsync 用 `--exclude data/`，Docker 用卷挂载）
3. 不要 `git push --force` 到 `main`（那是对外发布线）
4. 端口默认 `3031`，环境变量 `PORT` 可改；`DATA_DIR` 默认 `./data`
5. 改完前端必须 `cd web && npm run build`，否则服务会返回「前端尚未构建」（503）

## 2. 环境要求

- Node **18+**（20 LTS 最佳）；`npm` 可用
- 磁盘：代码 + 依赖约 150MB，数据随使用增长（JSON，通常 < 50MB）
- 网络：首次 `npm ci` 需要能访问 npm registry（国内可用 `--registry=https://registry.npmmirror.com`）

## 3. 部署（无 Docker）

```bash
# 1. 拉代码
git clone https://github.com/HollyLab0529/maodong-workbench.git /opt/workbench
cd /opt/workbench

# 2. 装依赖（后端）
npm ci --omit=dev

# 3. 构建前端（必须；产物写入 ../public）
cd web && npm ci && npm run build && cd ..

# 4. 前台自检：应输出 {"ok":true,...}
PORT=3031 DATA_DIR=/opt/workbench/data node server/index.js &
sleep 2 && curl -sf http://127.0.0.1:3031/api/health && kill %1

# 5. systemd 常驻
sed "s/__PORT__/3031/" deploy/workbench.service.tpl | sudo tee /etc/systemd/system/workbench.service
sudo systemctl daemon-reload && sudo systemctl enable --now workbench
```

反向代理（nginx）关键三行：`proxy_pass http://127.0.0.1:3031;`、`proxy_buffering off;`（SSE 必需）、`client_max_body_size 20m;`（简历/图片上传）。
HTTPS 用 `certbot --nginx -d <域名>`。

## 4. 部署（有 Docker）

```bash
cd /opt/workbench && docker compose up -d --build
```

镜像为两阶段构建（先构建前端，再拷贝 `public/`），数据通过 `./data:/data` 卷持久化。
PaaS（Railway / Render / Fly / Zeabur）：导入仓库 → **挂持久卷到 `/data`** → 设 `DATA_DIR=/data`。

## 5. 验收标准（必须逐条通过）

| # | 检查 | 期望 |
|---|---|---|
| 1 | `curl -sf http://127.0.0.1:$PORT/api/health` | `{"ok":true,...}` |
| 2 | `curl -s http://127.0.0.1:$PORT/ \| grep -o 'assets/index-[^"]*\.js'` | 有输出（说明前端构建产物存在） |
| 3 | `curl -sI http://127.0.0.1:$PORT/sw.js` | 200，且 `CACHE = "workbench-vNN"` |
| 4 | 浏览器访问首页 | 出现登录 / 注册页（首个注册账号自动成为「创作者」） |
| 5 | `curl -sI https://<域名>/ \| head -1` | HTTP/2 200（HTTPS 生效） |
| 6 | 写入测试：注册后新增一条待办，刷新仍在 | `data/db.json` 中出现该记录；重启服务后仍在 |

## 6. 常见失败与修复

| 症状 | 判定 | 修复 |
|---|---|---|
| 503「前端尚未构建：请把构建产物放到 public/ 目录」 | 没构建前端 | `cd web && npm ci && npm run build` |
| `EADDRINUSE` | 端口被占 | 换 `PORT`，或 `lsof -i :3031` 杀掉旧进程 |
| `EACCES` 写 data | 目录权限 | `chown -R <运行用户> $DATA_DIR` |
| 前端是旧版本 | Service Worker 缓存 | 强刷；或改 `web/public/sw.js` 的 `CACHE` 版本号 → 重新构建 → 重启 |
| 多端不同步 | SSE 被代理缓冲 | nginx 加 `proxy_buffering off;` |
| 手机通知 / 剪贴板失效 | 非 HTTPS | 配证书；仅 `localhost` 与 HTTPS 下这些 API 可用 |
| `npm ci` 卡住 | registry 慢 | 加 `--registry=https://registry.npmmirror.com` |

## 7. 回滚

- **代码**：`git checkout <上一个 tag/commit> && npm ci --omit=dev && (cd web && npm ci && npm run build) && sudo systemctl restart workbench`
- **数据**：`data/backups/` 里有每日快照（保留 14 天）；停服务 → 用快照覆盖 `data/db.json` → 起服务
- 二者互不影响：代码回滚不动数据，数据回滚不动代码

## 8. 一句话交付报告模板

```
部署完成：<域名/IP>
版本：<commit sha>    端口：3031    数据目录：<path>
验收：health ✅  首页 200 ✅  HTTPS ✅  写入持久化 ✅
备份：<方式/路径>
遗留：<无 / 具体项>
```
