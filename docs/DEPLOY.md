# 部署指南（两条线）

同一份代码，两种落地方式。先对号入座，再照着做。

| 你有 | 走哪条线 | 大概耗时 |
|---|---|---|
| 一台云服务器 / VPS（有公网 IP） | **线路 A：Node + systemd + nginx** | 20 分钟 |
| 没有服务器（只有电脑 / NAS / 想交给 Agent） | **线路 B：Docker / PaaS / 内网穿透** | 10 分钟 |

> 两条线都需要 **Node 18+**（推荐 20 LTS）。数据全部落在 `data/` 一个目录里，备份 = 拷走它，迁移 = 连同 `data/` 一起搬。

---

## 线路 A：有服务器（自己装，或交给 Agent）

### A1. 一键交给 Agent

把仓库地址和你服务器的访问方式发给 Agent，附上这段：

```
帮我把 https://github.com/HollyLab0529/maodong-workbench 部署到这台服务器：
1) 装 Node 20，clone 到 /opt/workbench
2) npm ci --omit=dev；cd web && npm ci && npm run build（产物在仓库根的 public/）
3) 用 deploy/workbench.service.tpl 生成 systemd 单元（替换 __PORT__，Environment 里给 DATA_DIR）
4) nginx 反代 + certbot 上 HTTPS
5) 验收：curl http://127.0.0.1:3031/api/health 返回 {"ok":true}；浏览器打开首页能出现注册页
每一步执行前先说明你要做什么；不要动 /opt/workbench/data 里已有数据。
```

详细执行清单见仓库根目录 **`AGENTS.md`**（那份是写给 Agent 读的）。

### A2. 手动部署

```bash
# 1) 环境
sudo apt install -y nginx git
# Node 20：用 nvm 或 NodeSource 安装，确认 node -v >= 20

# 2) 代码
sudo mkdir -p /opt/workbench && sudo chown $USER /opt/workbench
git clone https://github.com/HollyLab0529/maodong-workbench.git /opt/workbench
cd /opt/workbench

# 3) 依赖 + 构建前端
npm ci --omit=dev
cd web && npm ci && npm run build && cd ..

# 4) 跑起来（先前台验证）
PORT=3031 DATA_DIR=/opt/workbench/data node server/index.js
# 另开窗口：curl http://127.0.0.1:3031/api/health  →  {"ok":true,...}

# 5) 交给 systemd 常驻
sed "s/__PORT__/3031/" deploy/workbench.service.tpl | sudo tee /etc/systemd/system/workbench.service
sudo systemctl daemon-reload && sudo systemctl enable --now workbench
sudo systemctl status workbench --no-pager
```

nginx + HTTPS（`/etc/nginx/sites-available/workbench`）：

```nginx
server {
  server_name your-domain.com;
  client_max_body_size 20m;          # 简历 PDF / 图片上传

  location / {
    proxy_pass http://127.0.0.1:3031;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;             # SSE 实时同步需要
    proxy_read_timeout 3600s;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/workbench /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com     # 免费证书，自动续期
```

### A3. 日常更新

```bash
cd /opt/workbench && git pull && npm ci --omit=dev && (cd web && npm ci && npm run build)
sudo systemctl restart workbench
```

### A4. 从自己电脑一键部署 + 回滚（推荐）

仓库带了部署/回滚脚本，在你自己的电脑上运行（不是服务器上）：

```bash
# 只需配一次（该文件已被 .gitignore 排除，不会入库）
cat > deploy/deploy.local.sh <<'EOF'
SERVER="root@你的服务器IP"
KEY="$HOME/.ssh/你的密钥"
REMOTE_DIR="/opt/workbench"
EOF

zsh deploy/deploy.sh                 # 备份 → 构建 → 上传 → 重启 → 健康检查
zsh deploy/rollback.sh               # 列出可用备份
zsh deploy/rollback.sh data          # 恢复最新备份的数据（当前数据会先另存）
zsh deploy/rollback.sh code          # 回退代码与前端产物（不动数据）
zsh deploy/rollback.sh all           # 全量回滚
```

- 每次部署前自动把服务器上的 `data/` 与 `public/` 打包到 `$REMOTE_DIR` 同级的 `workbench-backups/`
- 保留最近 10 份（`KEEP_BACKUPS` 可调），备份含 `.secret` 与上传文件，**只留在服务器上，不进仓库**
- 健康检查失败时脚本会直接打印对应的回滚命令；回滚前会把当前 `db.json` 另存到 `data/backups/prerollback-*.tgz`，回滚本身也可再撤销

---

## 线路 B：没有服务器

### B1. Docker（自己电脑 / NAS / 任何装了 Docker 的机器）

```bash
git clone https://github.com/HollyLab0529/maodong-workbench.git
cd maodong-workbench
docker compose up -d --build        # 打开 http://localhost:3031
```

- 数据在 `./data`（挂载到容器 `/data`），备份直接拷这个目录
- 换端口：改 `docker-compose.yml` 里的 `"3031:3031"` 左侧数字
- 更新：`git pull && docker compose up -d --build`

### B2. PaaS（Railway / Render / Fly.io / Zeabur 等）

1. Fork 或导入这个仓库，平台会自动识别 `Dockerfile`
2. **必须挂持久卷到 `/data`**——否则每次重新部署 JSON 数据会被清空
3. 环境变量：`DATA_DIR=/data`；端口用平台注入的 `PORT`（不注入就显式设置）
4. 拿到平台给的域名即可访问（这些平台自带 HTTPS）

### B3. 家里的机器 + 内网穿透（想要自己的域名）

不想买服务器、又想让手机在外网访问：

```bash
# 用 Cloudflare Tunnel（免费，自带 HTTPS，不用公网 IP、不用开端口）
cloudflared tunnel --url http://localhost:3031
```

拿到 `https://xxx.trycloudflare.com` 这样的临时域名就能用了；固定域名需要绑自己的 Cloudflare 账号。
同类方案：Tailscale（设备组网，更私密）、frp（需一台有公网的跳板机）。

---

## 部署后要做的三件事

1. **注册第一个账号** —— 它就是「创作者 / 服务器主人」，能看全站灵感池、能收到别人的反馈
2. **HTTPS 一定要开** —— 令牌是明文 Bearer 传输；浏览器通知、剪贴板 API、PWA 安装也只在 HTTPS（或 localhost）下可用
3. **配好备份** —— 所有数据只在 `data/db.json`，建议每天同步到另一块盘 / 另一台机器：

```bash
# 每天 3:00 备份
0 3 * * * rsync -a /opt/workbench/data/ /backup/workbench-data/
```

---

## 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 打开是「前端尚未构建」 | 没跑 `cd web && npm run build`，或用 Docker 时没构建镜像 |
| 部署后页面还是旧的 | Service Worker 缓存：强刷一次（Cmd/Ctrl+Shift+R），或改 `web/public/sw.js` 的 `CACHE` 版本号后重新构建 |
| 手机收不到到期提醒 | 浏览器通知需 HTTPS + 用户授权；且页面需保持打开（没做原生推送服务） |
| 多设备不同步 | 检查是否都连同一个域名；SSE 需要 nginx 关闭 `proxy_buffering` |
| 数据想迁移 | 整个 `data/` 目录搬过去即可，`db.json` 是唯一真相源 |
