# API do Blog — Dra. Nilma Alves

API REST para criar, listar e gerenciar posts do blog. Pensada para ser usada por sistemas externos (CRM, geradores de conteúdo, etc.) através de **API Keys**.

## Sumário

- [Autenticação](#autenticação)
- [Documentação interativa](#documentação-interativa)
- [Endpoints](#endpoints)
- [Exemplos de uso](#exemplos-de-uso)

---

## Autenticação

Todas as requisições à API de gerenciamento `/api/v1/*` exigem o header:

```
X-API-Key: nilma_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> A API de leitura pública `/api/public/*` (usada pelas páginas `blog.html` e `post.html` do site) **não exige** autenticação e só retorna posts com `status: "published"`.

### Como obter uma chave

1. Acesse o painel admin: http://127.0.0.1:3001/admin/
2. Faça login com a senha administrativa
3. Vá na aba **Blog**
4. No card "API Keys (sistemas externos)", digite um nome (ex: "Site institucional") e clique em **Gerar nova chave**
5. Copie a chave retornada — **ela só é exibida uma única vez**

Se a chave for comprometida, clique em **Revogar** na lista de chaves. Sistemas externos deixarão de funcionar imediatamente.

---

## Documentação interativa

Acesse http://127.0.0.1:3001/api/docs/ para testar todos os endpoints direto no navegador (Swagger UI).

A especificação OpenAPI 3.0 está em http://127.0.0.1:3001/api/docs/openapi.json.

---

## Endpoints

### API pública (sem autenticação)

Usada pelas páginas `blog.html` e `post.html` do site. Retorna apenas posts publicados.

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/public/posts` | Listar posts publicados (suporta `?limit`, `?offset`, `?tag`) |
| `GET` | `/api/public/posts/:slug` | Detalhe de um post publicado por slug |
| `GET` | `/api/public/tags` | Listar tags únicas usadas nos posts |

### API de gerenciamento (requer `X-API-Key`)

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/v1/posts` | Listar posts publicados (suporta `?limit`, `?offset`, `?tag`) |
| `GET` | `/api/v1/posts/:slug` | Detalhe de um post publicado por slug |
| `GET` | `/api/v1/tags` | Listar tags únicas usadas nos posts |
| `POST` | `/api/v1/posts` | Criar post (opcionalmente já publicado via `status`) |
| `PUT` | `/api/v1/posts/:id` | Atualizar post (inclui `status`) |
| `DELETE` | `/api/v1/posts/:id` | Remover post |
| `POST` | `/api/v1/posts/:id/publish` | Publicar (status → `published`, seta `publishedAt`) |
| `POST` | `/api/v1/posts/:id/unpublish` | Voltar para rascunho (status → `draft`) |
| `POST` | `/api/v1/posts/:id/archive` | Arquivar (status → `archived`) |
| `POST` | `/api/v1/posts/:id/images` | Upload de imagem (multipart) |

> O `POST /api/v1/posts` aceita o campo `status` opcional. Se omitido, o post é criado como rascunho (`draft`). Sistemas externos podem enviar `"status": "published"` para criar o post já público (ex.: após uma revisão interna). Valores aceitos: `draft`, `published`, `archived`. Da mesma forma, o `PUT /api/v1/posts/:id` aceita `status` para alterar o estado. Os endpoints dedicados `/publish`, `/unpublish` e `/archive` continuam disponíveis para transições explícitas.

### Rate limit

60 requisições por minuto por IP. Se exceder, a API retorna `429`.

### Limites

- Tamanho máximo de imagem: **5 MB** (configurável via `BLOG_UPLOAD_MAX_MB`)
- Formatos aceitos: JPEG, PNG, WebP

---

## Exemplos de uso

### Listar posts publicados

```bash
curl -X GET "http://127.0.0.1:3001/api/v1/posts?limit=10" \
  -H "X-API-Key: nilma_sua_chave_aqui"
```

```json
{
  "total": 3,
  "limit": 10,
  "offset": 0,
  "items": [
    {
      "id": 1,
      "slug": "novidades-direito-imobiliario-2026",
      "title": "Novidades do direito imobiliário em 2026",
      "excerpt": "Resumo curto do post...",
      "coverImage": "/uploads/blog/capa-123.jpg",
      "author": "Dra. Nilma Alves",
      "tags": ["imobiliario", "2026"],
      "status": "published",
      "publishedAt": "2026-06-20T18:30:00.000Z",
      "createdAt": "2026-06-20T18:30:00.000Z",
      "updatedAt": "2026-06-20T18:30:00.000Z"
    }
  ]
}
```

### Criar post e publicar

```bash
curl -X POST "http://127.0.0.1:3001/api/v1/posts" \
  -H "X-API-Key: nilma_sua_chave_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Novidades do direito imobiliário em 2026",
    "excerpt": "Confira as principais mudanças legislativas...",
    "contentHtml": "<p>Conteúdo completo do post com <strong>HTML</strong> permitido.</p><h2>Subtítulo</h2><p>Mais texto...</p>",
    "coverImage": "/uploads/blog/capa.jpg",
    "tags": ["imobiliario", "2026"],
    "status": "published"
  }'
```

### Criar como rascunho

```bash
curl -X POST "http://127.0.0.1:3001/api/v1/posts" \
  -H "X-API-Key: nilma_sua_chave_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Post em rascunho",
    "contentHtml": "<p>Conteúdo...</p>"
  }'
```

### Publicar um rascunho

```bash
curl -X POST "http://127.0.0.1:3001/api/v1/posts/5/publish" \
  -H "X-API-Key: nilma_sua_chave_aqui"
```

### Atualizar post

```bash
curl -X PUT "http://127.0.0.1:3001/api/v1/posts/5" \
  -H "X-API-Key: nilma_sua_chave_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Título atualizado",
    "tags": ["imobiliario", "atualizado"]
  }'
```

### Upload de imagem para um post

```bash
curl -X POST "http://127.0.0.1:3001/api/v1/posts/5/images" \
  -H "X-API-Key: nilma_sua_chave_aqui" \
  -F "image=@/caminho/para/foto.jpg" \
  -F "alt=Descrição da imagem"
```

Resposta:

```json
{
  "id": 12,
  "url": "/uploads/blog/1234567890-foto-abc123.jpg",
  "alt": "Descrição da imagem",
  "position": 1718906543210
}
```

### Exemplo em JavaScript (fetch)

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
    const err = await res.json();
    throw new Error(err.error || 'Erro ao criar post');
  }
  return res.json();
}

await createPost({
  title: 'Post via JS',
  contentHtml: '<p>Conteúdo...</p>',
  tags: ['js', 'automacao'],
  status: 'published',
});
```

### Exemplo em Python (requests)

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

response = requests.post(f"{BASE}/posts", json=payload, headers=headers)
response.raise_for_status()
print(response.json())
```

---

## Segurança

- HTML do conteúdo é **sanitizado** (tags perigosas, event handlers e `javascript:` são removidos) via `sanitize-html` no servidor
- O front ainda aplica `DOMPurify` ao renderizar, em camadas
- API Keys são armazenadas com **hash SHA-256** — a chave pura só é mostrada na criação
- Rate limit em memória: 60 req/min por IP
- Imagens validadas por MIME type e tamanho

---

## Esquema do banco

As tabelas ficam em `data/blog.db` (SQLite). Estrutura:

- `posts` (id, slug, title, excerpt, content_html, cover_image, author, tags, status, published_at, created_at, updated_at)
- `post_images` (id, post_id, url, alt, position)
- `api_keys` (id, name, key_hash, prefix, created_at, last_used_at, revoked)

O arquivo é criado automaticamente ao iniciar o servidor.
