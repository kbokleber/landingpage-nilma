FROM node:20-alpine

WORKDIR /app

# Dependências
COPY package*.json ./
RUN npm ci --omit=dev

# Código
COPY . .

# Pasta para banco e uploads (será montada como volume)
RUN mkdir -p /app/data/uploads/blog
ENV NODE_ENV=production
ENV PORT=3000
ENV BLOG_DB_PATH=/app/data/blog.db

EXPOSE 3000

# Healthcheck simples
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/public/instagram/recent || exit 1

CMD ["node", "server/index.js"]
