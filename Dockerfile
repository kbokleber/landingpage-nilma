FROM node:20-bookworm-slim

# better-sqlite3 publica binário pronto para Node 20 em Debian (glibc).
# Não instalamos gcc/Python: essa etapa é o que deixava o redeploy do Coolify lento.

WORKDIR /app

COPY package*.json ./
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm ci --omit=dev

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
