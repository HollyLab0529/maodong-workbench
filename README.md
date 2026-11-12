# 猫冬手帐 · Maodong Workbench

> 一个自托管的个人生活 / 求职工作台。纯 Node + Express + JSON 文件存储,零外部服务依赖——`npm install && npm start` 就能跑,备份就是拷走一个目录。

<!-- TODO: 截图(总览/求职看板/日历三张,裁掉地址栏) -->

## 它是什么

一套给自己用的「第二大脑 + 求职指挥台」:

- **知识库** —— Markdown 文章管理,分类配色 + 标签 + 全文搜索,单篇/整批导出 `.md`
- **求职深水区** —— 投递看板、面试复盘、简历库(支持 PDF/DOCX 上传)、Offer 对比
- **待办** —— 四象限矩阵(格子名可自定义、支持格子内快速添加)、优先级、具体时间与地点
- **账号管理** —— 各平台账号密码集中记,默认打码、一键复制、强度判定、重复密码检测、随机密码生成
- **过期提醒** —— 调料 / 化妆品的到期日与倒计时,临期推送浏览器通知
- **书影音 / 阅读笔记** —— 书影音条目 + 评分笔记,支持导出书单 `.md`
- **习惯打卡 / 健身 / 体重 / 睡眠 / 订阅 / 旅行 / 菜谱 / 记账**(预算 + 趋势图)
- **时间线 / 日历**(月视图 + 纪念日)、**总览 Dashboard** —— 今日焦点 + 各模块趋势
- **模块超市** —— 模块按需装卸、拖拽排序;「灵感池」可向开发者提需求
- **个性化** —— 五套配色 + 暗色模式、标题/正文字体独立可选、侧栏可折叠可拖拽调宽
- **PWA**:可安装到手机桌面,离线打开壳,多端实时同步(SSE)

### 特色:AI 助手接入层

内置 Bearer 令牌鉴权的开放 API(含接口文档页 `/apidoc`)。在设置页生成令牌后,任何 AI 助手或脚本——CatPaw、Claude Code、iOS 快捷指令、你自己的 Agent——都能直接读写你的手帐:

```bash
curl -X POST http://localhost:3031/api/data/kb_articles \
  -H "Authorization: Bearer <你的令牌>" \
  -H "Content-Type: application/json" \
  -d '{"title":"标题","category":"技术学习","tags":"标签","content":"Markdown 正文"}'
```

多令牌 + 读写 scope 设计:给只读分析脚本和可写助手分别签发,泄露可单独吊销。

## 快速开始

```bash
git clone https://github.com/<you>/maodong-workbench.git
cd maodong-workbench
npm install
(cd web && npm install && npm run build)   # 构建前端到 public/
npm start                                   # http://localhost:3031
```

<!-- TODO: 首次注册引导说明(视 SMTP/邀请码逻辑而定) -->

## 部署方式

两条路线,选一条:**有服务器**(VPS + 域名,systemd + nginx + HTTPS)或 **没有服务器**(Docker / PaaS / 内网穿透,只需挂持久卷)。详细逐步说明见 **[docs/DEPLOY.md](docs/DEPLOY.md)**;想让 AI Agent 代劳,直接把仓库 + **[AGENTS.md](AGENTS.md)** 交给它。

| 方式 | 适合人群 | 说明 |
|---|---|---|
| 本地运行 | 想先试用 | 上面的快速开始即可,数据在本机 `data/` |
| VPS + 系统服务 | 正式自托管 | `deploy/deploy.sh`(rsync + systemd 模板):先把 `SERVER` / `KEY` / `REMOTE_DIR` 写进 `deploy/deploy.local.sh`(已 gitignore),再 `zsh deploy/deploy.sh`;建议配 nginx 反代 + HTTPS |
| Docker Compose | 有 Docker 环境 | `docker compose up -d --build`,数据挂载在 `./data` |
| 一键 PaaS(Railway / Zeabur 等) | 没有服务器 | 注册即送子域名;**注意挂持久卷**,否则重新部署会丢 JSON 数据 |
| 交给 AI Agent | 都不熟 | 见 `AGENTS.md`(验收标准、常见失败、回滚都写好了) |

> 克隆后先跑 `zsh scripts/install-git-hooks.sh`,装上防泄密钩子(拦截 `data/`、令牌、服务器配置误提交)。

### 环境变量(可选)

| 变量 | 作用 |
|---|---|
| `PORT` | 服务端口,默认 `3031` |
| `DATA_DIR` | 数据目录,默认 `./data` |
| `OWNER_EMAIL` | 指定「创作者」账号邮箱(默认第一个注册账号),用于查看全站灵感池 |
| `VITE_SITE_BASE` | 构建前端时注入作品集站点地址,用于「反馈」页跳转链接(不配则隐藏) |

### 数据与隐私

- 所有数据只存在 `data/db.json`(按 `user_id` 隔离),备份 = 拷走 `data/` 目录
- 「账号管理」模块里的密码是**明文存储在 JSON 文件**中的,仅靠登录会话与文件权限保护——**没有端到端加密**。不要用它存银行/支付类高危密码,或用系统钥匙串 / 密码管理器保管主密码
- 公网部署务必走 HTTPS,并限制 `data/` 目录的访问权限

> ⚠️ **安全提示**:默认配置只适合本机/内网。公网部署请务必:① 走 HTTPS(令牌是明文 Bearer);② 定期备份 `data/` 目录(所有数据都在里面,包括 `.secret`——它丢了令牌体系就要重置)。

## 技术栈

- **后端**:Node 18+ / Express,JSON 文件存储(`data/db.json`),HMAC 签名的令牌鉴权,SSE 实时推送
- **前端**:React 18 + Vite + Tailwind,五套主题配色 + 暗色模式,⌘K 全局搜索
- **部署**:单进程单目录,无数据库依赖;Docker / systemd / PaaS 均可

## License

[MIT](LICENSE)
