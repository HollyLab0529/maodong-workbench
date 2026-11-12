# 猫冬手帐 · 单镜像部署
# 构建: docker build -t maodong-workbench .
# 运行: docker run -d -p 3031:3031 -v $(pwd)/data:/data --name workbench maodong-workbench
#
# 数据全部落在容器内 /data（挂载到宿主机即完成备份），镜像内不含任何数据。

# ---------- 阶段 1：构建前端 ----------
FROM node:20-alpine AS web
WORKDIR /app
# 先装依赖，利用层缓存；web 的 vite 输出目录是 ../public
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci --no-audit --no-fund
COPY web ./web
RUN cd web && npm run build

# ---------- 阶段 2：运行时 ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3031 \
    DATA_DIR=/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY server ./server
COPY deploy ./deploy
# 前端产物（含 vite 从 web/public 拷贝的图标 / sw.js / manifest）
COPY --from=web /app/public ./public

RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 3031
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3031)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
