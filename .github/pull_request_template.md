## 这个 PR 做了什么

<!-- 一两句说清解决什么问题 -->

## 怎么验证的

<!-- 命令、截图、接口返回都行。涉及 UI 请附截图（个人信息记得打码） -->

## 影响到哪里

- [ ] 新增/修改了数据集合（已同改 `COLLECTIONS` / `API_COLLECTIONS` / `DEFAULT_DB` 三处）
- [ ] 改了 Markdown 渲染（根节点是否仍带 `md-body` 类）
- [ ] 改了配色/字体（是否走主题变量而非写死色值）
- [ ] 新增模块（已登记到 `web/src/modules.js`）
- [ ] 只动文档/脚本，不涉及运行逻辑

## 自检

- [ ] `cd web && npm run build` 通过
- [ ] `node --check` 所有 server 文件通过
- [ ] `/api/health` 返回 `{"ok":true}`
- [ ] 没有提交 `data/`、`.env`、令牌或 `deploy/deploy.local.sh`
