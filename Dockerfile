FROM node:20-bookworm-slim

# better-sqlite3 precisa compilar a extensão nativa (node-gyp + Python + make + gcc).
# Debian slim já tem a toolchain, então a build é mais confiável.
# Após a instalação das deps, removemos a toolchain para reduzir o tamanho da imagem.

WORKDIR /app

# Dependências de build (só necessárias na etapa de npm ci)
COPY package*.json ./
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm ci --omit=dev \
  && apt-get purge -y --auto-remove python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Código
COPY . .

# Pasta para banco e uploads (será montada como volume)
RUN mkdir -p /app/data/uploads/blog
ENV NODE_ENV=production
ENV PORT=3000
ENV BLOG_DB_PATH=/app/data/blog.db

EXPOSE 3000

# Healthcheck simples
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server/index.js"]
