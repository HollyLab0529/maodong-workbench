# 猫冬手帐 · Maodong Workbench

> 一个自托管的个人生活 / 求职工作台。纯 Node + Express + JSON 文件存储,零外部服务依赖——`npm install && npm start` 就能跑,备份就是拷走一个目录。

<!-- TODO: 截图(总览/求职看板/日历三张,裁掉地址栏) -->

## 它是什么

一套给自己用的「第二大脑 + 求职指挥台」:

- **知识库** —— Markdown 文章管理,分类 + 标签
- **求职深水区** —— 投递看板、面试复盘、简历库(支持 PDF/DOCX 上传)、Offer 对比
- **习惯打卡 / 待办**(支持重复待办与提醒)
- **记账**(预算 + 趋势图)、**时间线 / 日历**(月视图 + 纪念日)
- **总览 Dashboard** —— 今日焦点 + 各模块趋势
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

| 方式 | 适合人群 | 说明 |
|---|---|---|
| 本地运行 | 想先试用 | 上面的快速开始即可,数据在本机 `data/` |
| VPS + Docker/系统服务 | 正式自托管 | 见 `deploy/`(rsync + systemd 模板),建议配 nginx 反代 + HTTPS |
| 一键 PaaS(Railway / Zeabur 等) | 没有服务器 | 注册即送子域名;**注意挂持久卷**,否则重新部署会丢 JSON 数据 |

> ⚠️ **安全提示**:默认配置只适合本机/内网。公网部署请务必:① 走 HTTPS(令牌是明文 Bearer);② 定期备份 `data/` 目录(所有数据都在里面,包括 `.secret`——它丢了令牌体系就要重置)。

## 技术栈

- **后端**:Node 18+ / Express,JSON 文件存储(`data/db.json`),HMAC 签名的令牌鉴权,SSE 实时推送
- **前端**:React 18 + Vite + Tailwind,五套主题配色 + 暗色模式,⌘K 全局搜索
- **部署**:单进程单目录,无数据库依赖;Docker / systemd / PaaS 均可

## License

[MIT](LICENSE)
