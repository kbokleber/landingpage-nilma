# Deploy — Volumes persistentes

## Estrutura que precisa persistir (Coolify / Docker / VPS)

Todo o conteúdo mutável fica em **`/app/data`** dentro do container. Monte **um único volume** nesse path e tudo se mantém entre redeploys:

```
/app/data/
├── blog.db                       # banco SQLite (posts, imagens, api keys, settings)
├── blog.db-shm                   # SQLite WAL
├── blog.db-wal                   # SQLite WAL
├── uploads/
│   └── blog/                     # CAPAS E GALERIA DOS POSTS DO BLOG
│       ├── <timestamp>-cover-<hash>.png
│       └── ...
├── instagram-tokens.json         # token OAuth do Instagram
├── instagram-sync-meta.json      # controle de última sincronização
├── oauth-tokens.json             # tokens Google (reviews)
└── reviews-draft.json            # rascunhos de avaliações Google
```

## Variáveis de ambiente relacionadas

| Variável | Padrão no container | Função |
|----------|---------------------|--------|
| `BLOG_DB_PATH` | `/app/data/blog.db` | Caminho do banco SQLite |
| `BLOG_UPLOAD_DIR` | `/app/data/uploads/blog` | Pasta onde multer grava as capas/galeria |
| `BLOG_UPLOAD_MAX_MB` | `10` | Tamanho máximo por imagem em MB |

> **Importante:** se você sobrescrever `BLOG_UPLOAD_DIR` para um caminho fora de `/app/data`, as imagens se perdem a cada redeploy. Mantenha dentro do volume.

## docker-compose (referência)

```yaml
services:
  app:
    environment:
      - BLOG_DB_PATH=/app/data/blog.db
      - BLOG_UPLOAD_DIR=/app/data/uploads/blog
    volumes:
      - nilma-data:/app/data   # ⚠️ NÃO REMOVA — mantém banco + uploads

volumes:
  nilma-data:
    driver: local
```

## Coolify (UI)

Se você usa a interface web do Coolify:

1. Abra o serviço → **Storages**
2. Adicione **um único** storage:
   - **Source**: `nilma-data` (ou o nome que preferir)
   - **Destination**: `/app/data`
3. Não precisa adicionar storages separados para `/app/data/uploads/blog` — está coberto pelo path pai.

## Como confirmar que está persistindo

Após subir o container, crie um post com capa pelo painel admin e reinicie o container. A capa deve continuar aparecendo. Se sumir, o volume não está montado em `/app/data`.

Para inspecionar o volume:

```bash
docker exec -it landingpage-nilma ls -la /app/data
docker exec -it landingpage-nilma ls -la /app/data/uploads/blog
```