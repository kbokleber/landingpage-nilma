# API do Blog — Dra. Nilma Alves

Documento para o time/software externo que vai **alimentar o blog** (criar, atualizar e publicar posts).

---

## O que você precisa receber

| Item | Valor |
|---|---|
| **Base URL (local)** | `http://127.0.0.1:3001` |
| **Base URL (produção)** | `https://SEU_DOMINIO` ← substituir |
| **Prefixo da API de escrita** | `/api/v1` |
| **Header de autenticação** | `X-API-Key: <chave>` |
| **Docs interativas (Swagger)** | `{BASE}/api/docs/` |
| **OpenAPI JSON** | `{BASE}/api/docs/openapi.json` |

A chave é gerada no painel admin:

1. Acesse `{BASE}/admin/`
2. Login com a senha administrativa
3. Aba **Configurações** → **Site** → card **API Keys (sistemas externos)**
4. Digite um nome (ex.: `Sistema de conteúdo`) e clique em **Gerar nova chave**
5. **Copie a chave imediatamente** — ela só aparece uma vez

---

## Fluxo recomendado para o outro software

```
1. POST /api/v1/posts          → cria o post (draft ou published)
2. POST /api/v1/posts/{id}/cover   → (opcional) envia a capa
3. POST /api/v1/posts/{id}/images  → (opcional) envia imagens da galeria
4. POST /api/v1/posts/{id}/publish → publica (se criou como draft)
```

Se o conteúdo já estiver revisado no sistema de origem, pode criar direto com `"status": "published"` no passo 1 e pular o passo 4.

---

## Autenticação

Todas as rotas `/api/v1/*` exigem:

```http
X-API-Key: nilma_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

Respostas comuns de erro:

| HTTP | Significado |
|---|---|
| `401` | Chave ausente ou inválida |
| `400` | Payload inválido |
| `404` | Post não encontrado |
| `429` | Rate limit (60 req/min por IP) |

A API pública `/api/public/*` (só leitura de posts **publicados**, usada pelo site) **não** exige chave.

---

## Endpoints de gerenciamento (`X-API-Key`)

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/v1/posts` | Listar posts (`?limit`, `?offset`, `?tag`, `?status`) |
| `GET` | `/api/v1/posts/:slugOrId` | Detalhe por **slug** ou **ID** (qualquer status) |
| `POST` | `/api/v1/posts` | Criar post |
| `PUT` | `/api/v1/posts/:id` | Atualizar post |
| `DELETE` | `/api/v1/posts/:id` | Remover post |
| `POST` | `/api/v1/posts/:id/publish` | Publicar |
| `POST` | `/api/v1/posts/:id/unpublish` | Voltar para rascunho |
| `POST` | `/api/v1/posts/:id/archive` | Arquivar |
| `POST` | `/api/v1/posts/:id/cover` | Upload da capa (`multipart`, campo `cover`) |
| `POST` | `/api/v1/posts/:id/images` | Upload de imagem (`multipart`, campo `image`) |
| `GET` | `/api/v1/tags` | Listar tags |

### Query `status` em `GET /api/v1/posts`

| Valor | Resultado |
|---|---|
| `published` (padrão) | Só publicados |
| `draft` | Só rascunhos |
| `archived` | Só arquivados |
| `all` | Todos |

---

## Contrato do payload (criar / atualizar)

Campos do body JSON:

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `title` | string | **sim** | Gera o `slug` automaticamente |
| `contentHtml` | string | **sim** | HTML sanitizado no servidor |
| `excerpt` | string | não | Resumo da listagem |
| `author` | string | não | Padrão: Dra. Nilma Alves |
| `tags` | string[] | não | Ex.: `["imobiliario","familia"]` |
| `coverImage` | string | não | URL relativa após upload |
| `status` | string | não | `draft` (padrão), `published`, `archived` |

Exemplo de resposta `201` / `200`:

```json
{
  "id": 12,
  "slug": "novidades-direito-imobiliario-2026",
  "title": "Novidades do direito imobiliário em 2026",
  "excerpt": "Confira as principais mudanças...",
  "contentHtml": "<p>Conteúdo...</p>",
  "coverImage": "/uploads/blog/capa-123.jpg",
  "author": "Dra. Nilma Alves",
  "tags": ["imobiliario", "2026"],
  "status": "published",
  "publishedAt": "2026-09-11T21:00:00.000Z",
  "createdAt": "2026-09-11T21:00:00.000Z",
  "updatedAt": "2026-09-11T21:00:00.000Z"
}
```

O post publicado fica disponível no site em:

- Listagem: `{BASE}/blog.html`
- Detalhe: `{BASE}/post.html?slug={slug}`
- API pública: `GET {BASE}/api/public/posts` e `GET {BASE}/api/public/posts/{slug}`

---

## Exemplos prontos para colar

### Criar já publicado

```bash
curl -X POST "http://127.0.0.1:3001/api/v1/posts" \
  -H "X-API-Key: nilma_sua_chave_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Novidades do direito imobiliário em 2026",
    "excerpt": "Confira as principais mudanças legislativas...",
    "contentHtml": "<p>Conteúdo completo do post com <strong>HTML</strong>.</p>",
    "tags": ["imobiliario", "2026"],
    "status": "published"
  }'
```

### Criar como rascunho e publicar depois

```bash
# 1) cria
curl -X POST "http://127.0.0.1:3001/api/v1/posts" \
  -H "X-API-Key: nilma_sua_chave_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Post em revisão",
    "contentHtml": "<p>Conteúdo...</p>"
  }'

# 2) publica (troque 12 pelo id retornado)
curl -X POST "http://127.0.0.1:3001/api/v1/posts/12/publish" \
  -H "X-API-Key: nilma_sua_chave_aqui"
```

### Upload de capa

```bash
curl -X POST "http://127.0.0.1:3001/api/v1/posts/12/cover" \
  -H "X-API-Key: nilma_sua_chave_aqui" \
  -F "cover=@/caminho/para/capa.jpg"
```

### Upload de imagem da galeria

```bash
curl -X POST "http://127.0.0.1:3001/api/v1/posts/12/images" \
  -H "X-API-Key: nilma_sua_chave_aqui" \
  -F "image=@/caminho/para/foto.jpg" \
  -F "alt=Descrição da imagem"
```

### Listar todos os posts (qualquer status)

```bash
curl -X GET "http://127.0.0.1:3001/api/v1/posts?status=all&limit=50" \
  -H "X-API-Key: nilma_sua_chave_aqui"
```

### JavaScript (fetch)

```javascript
const API_KEY = 'nilma_sua_chave_aqui';
const BASE = 'http://127.0.0.1:3001/api/v1';

async function createPost(post) {
  const res = await fetch(`${BASE}/posts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify(post),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

await createPost({
  title: 'Post via integração',
  contentHtml: '<p>Conteúdo...</p>',
  tags: ['automacao'],
  status: 'published',
});
```

### Python (requests)

```python
import requests

API_KEY = "nilma_sua_chave_aqui"
BASE = "http://127.0.0.1:3001/api/v1"

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json",
}

payload = {
    "title": "Post via Python",
    "excerpt": "Resumo curto",
    "contentHtml": "<p>Conteúdo completo...</p>",
    "tags": ["python", "automacao"],
    "status": "published",
}

r = requests.post(f"{BASE}/posts", json=payload, headers=headers)
r.raise_for_status()
print(r.json())
```

---

## Limites e segurança

- **Rate limit:** 60 requisições/minuto por IP
- **Imagens:** até **5 MB** (JPEG, PNG, WebP) — configurável via `BLOG_UPLOAD_MAX_MB`
- **HTML:** sanitizado no servidor (`sanitize-html`); scripts e event handlers são removidos
- **API Keys:** armazenadas com hash SHA-256; a chave pura só aparece na criação
- Se a chave vazar: revogue no admin e gere outra

---

## Checklist para o time integrador

- [ ] Recebeu a **Base URL** de produção
- [ ] Recebeu a **API Key** (header `X-API-Key`)
- [ ] Consegue abrir `{BASE}/api/docs/` (Swagger)
- [ ] Testou `POST /api/v1/posts` com `status: "published"`
- [ ] Confirmou o post em `{BASE}/blog.html` e no admin → Blog
- [ ] (Opcional) Testou upload de capa e imagens

---

## API pública (somente leitura — site)

| Método | Rota | Auth |
|---|---|---|
| `GET` | `/api/public/posts` | não |
| `GET` | `/api/public/posts/:slug` | não |
| `GET` | `/api/public/tags` | não |

Use essas rotas só se o outro software precisar **ler** o que já está publicado no site. Para **escrever**, use sempre `/api/v1` com a API Key.

---

# API de Depoimentos — Dra. Nilma Alves

Mesma autenticação (`X-API-Key`). Fluxo igual ao blog: **rascunho** → **publicar**.

## Fluxo recomendado

```
1. POST /api/v1/reviews              → cria (draft por padrão)
2. POST /api/v1/reviews/{id}/publish → publica no site
```

Ou crie já publicado com `"publish": true` / `"siteStatus": "published"`.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/v1/reviews` | Listar (`?status=all\|draft\|published`) |
| `GET` | `/api/v1/reviews/:id` | Detalhe |
| `POST` | `/api/v1/reviews` | Criar |
| `PUT` | `/api/v1/reviews/:id` | Atualizar |
| `DELETE` | `/api/v1/reviews/:id` | Remover |
| `POST` | `/api/v1/reviews/:id/publish` | Publicar |
| `POST` | `/api/v1/reviews/:id/unpublish` | Voltar a rascunho |
| `POST` | `/api/v1/reviews/publish` | Republicar lista completa no site |
| `GET` | `/api/public/reviews` | Só publicados (sem chave) |

## Payload (criar / atualizar)

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `author` / `authorName` | string | **sim** (criar) | Nome do cliente |
| `text` | string | **sim** | Texto do depoimento |
| `rating` | int 1–5 | não | Padrão: 5 |
| `area` | string | não | Ex.: Direito de Família |
| `siteStatus` / `status` | string | não | `draft` (padrão) ou `published` |
| `publish` | boolean | não | Se `true`, publica imediatamente |

### Criar como rascunho e publicar depois

```bash
# 1) cria rascunho
curl -X POST "http://127.0.0.1:3001/api/v1/reviews" \
  -H "X-API-Key: nilma_sua_chave_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "author": "Maria S.",
    "text": "Atendimento excelente e humano.",
    "rating": 5,
    "area": "Direito de Família"
  }'

# 2) publica (troque o id)
curl -X POST "http://127.0.0.1:3001/api/v1/reviews/UUID_AQUI/publish" \
  -H "X-API-Key: nilma_sua_chave_aqui"
```

### Criar já publicado

```bash
curl -X POST "http://127.0.0.1:3001/api/v1/reviews" \
  -H "X-API-Key: nilma_sua_chave_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "author": "João P.",
    "text": "Resolução rápida e clara.",
    "rating": 5,
    "publish": true
  }'
```

No admin: aba **Depoimentos** → **Novo depoimento** → **Salvar rascunho** ou **Publicar agora**.
