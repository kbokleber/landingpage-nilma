# Landing Page — Dra. Nilma Alves

Landing page institucional com blog, depoimentos, painel administrativo e API para sistemas externos.

---

## 1. Pré-requisitos

- **Node.js 18+** (recomendado 20 LTS)
- **SQLite 3** (já vem com `better-sqlite3` no npm)
- **Git**

---

## 2. Instalação local

```bash
git clone <repo>
cd LandingPage-Nilma
npm install
node server/index.js
```

Por padrão o servidor sobe em `http://localhost:3001`.

- **Site público:** http://localhost:3001/
- **Painel admin:** http://localhost:3001/admin/
- **Swagger (API):** http://localhost:3001/api/docs

Acesso ao admin: usuário/senha na tabela `users` (hash scrypt). No primeiro start o sistema cria `admin` (migra senha antiga ou gera senha aleatória no log). Troque em **Admin → Usuários**. Não há mais senha padrão chumbada no código.

---

## 3. Variáveis de ambiente (`.env`)

Todas as configurações foram migradas para a tabela `settings` no banco SQLite e podem ser editadas via painel admin. O `.env` é usado **apenas na primeira execução** como fallback antes da migração.

```env
PORT=3001
ADMIN_PASSWORD=nilma-admin
```

> Em produção, prefira definir tudo via painel admin.

---

## 4. Painel admin

| Aba | Função |
|-----|--------|
| **Depoimentos** | Criar, editar, rascunho/publicar depoimentos |
| **Blog** | Posts com editor rico, capa e galeria |
| **Configurações** | Senha, porta, editor, API Keys |
| **Ajuda** | Guia rápido |

---

## 5. API externa (`X-API-Key`)

Documentação completa: [`docs/API.md`](docs/API.md) e Swagger em `/api/docs/`.

| Prefixo | Auth | Uso |
|---------|------|-----|
| `/api/v1/posts` | API Key | CRUD + publish de posts |
| `/api/v1/reviews` | API Key | CRUD + publish de depoimentos |
| `/api/public/*` | nenhuma | Leitura do que já está publicado |

Gere a chave em **Configurações → API Keys**.

---

## 6. Deploy

Veja [`DEPLOY.md`](DEPLOY.md) para volumes Docker/Coolify.

```bash
docker compose up -d --build
```

---

## 7. Estrutura relevante

```
├── admin/                 # Painel administrativo
├── assets/reviews.json    # Depoimentos publicados (site)
├── data/
│   ├── blog.db            # SQLite (posts, settings, api keys)
│   ├── reviews-draft.json # Rascunhos de depoimentos
│   └── uploads/blog/      # Capas e galeria
├── docs/API.md
└── server/
    ├── index.js
    ├── lib/
    └── routes/
```
