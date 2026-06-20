# Landing Page — Dra. Nilma Alves

Landing page institucional com blog integrado, painel administrativo, API para sistemas externos e sincronização automática de posts do Instagram.

---

## 1. Pré-requisitos

- **Node.js 18+** (recomendado 20 LTS)
- **SQLite 3** (já vem com `better-sqlite3` no npm)
- **Git**
- Domínio público com HTTPS (para OAuth do Instagram / Google em produção)

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

A senha admin padrão é `nilma-admin` — **troque na primeira execução** em `Configurações` → `Senha do admin`.

---

## 3. Variáveis de ambiente (`.env`)

Todas as configurações foram migradas para a tabela `settings` no banco SQLite e podem ser editadas via painel admin. O `.env` é usado **apenas na primeira execução** como fallback antes da migração.

```env
PORT=3001
ADMIN_PASSWORD=nilma-admin
```

> Em produção, prefira definir tudo via painel admin. A cada alteração o `settings.setMany` é chamado e a entrada é persistida no banco.

---

## 4. Integração com Instagram (Business Login)

A landing page sincroniza automaticamente os posts do Instagram `@advnilmaalves` para a seção **"Últimos Conteúdos"** da home, separada do blog.

### 4.1. Pré-requisitos

- A conta `@advnilmaalves` deve ser **Business** ou **Creator** (Settings → Account type → Switch to professional account)
- Uma **Business Portfolio / Empresa** no Facebook (criar em https://business.facebook.com)
- O login no Facebook usado para criar o app deve ter **acesso de Admin/Developer** no app

### 4.2. Criar app no Meta for Developers

1. Acesse https://developers.facebook.com/apps/creation/
2. Tipo: **Outros → Empresa** (ou Consumer, se preferir)
3. Casos de uso: marque **"Autenticar e solicitar dados de usuários com o Login do Facebook"**
4. Conclua o setup até **"Visão geral"**
5. Anote o **App ID** e o **App Secret** (em Configurações → Básico — clique em "Mostrar")

### 4.3. Adicionar produto Instagram

1. No menu lateral, **"Adicionar produto"**
2. Procure por **"Instagram" → "API setup with Instagram Login"** (Business Login — **NÃO** "API Graph do Instagram", que é o legado)
3. Clique em **"Configurar"**

### 4.4. Configurar OAuth Redirect URI

Em **"Configuração da API com login" → "Auxiliar de integração de API"** (ou em "Login da empresa"):

Adicione exatamente a mesma URI que o servidor vai usar:

```
https://seu-dominio.com.br/api/instagram/callback
```

> Em desenvolvimento, o Meta adiciona automaticamente `http://localhost:3001/api/instagram/callback`. Para qualquer outro domínio, é necessário comprovar controle (upload de HTML na raiz ou TXT no DNS).

### 4.5. Permissões

Em **"Permissões e recursos"**, habilite:

- ✅ `instagram_business_basic` (ler perfil + mídia — **obrigatório**)

Não habilite: `pages_show_list`, `pages_read_engagement`, `ads_management`, etc. — não são necessários.

### 4.6. Adicionar conta de teste (recomendado para dev)

1. Menu lateral → **"Funções" → "Funções do app" → "Testador do Instagram"**
2. Adicione `advnilmaalves` como testadora
3. A Nilma precisa aceitar o convite no app do Instagram dela:
   - Perfil → Menu ≡ → **Configurações → Conta → Apps e sites → Test apps** → aceitar
4. Com testadora, o login funciona **sem App Review**

### 4.7. App Review (para produção)

Quando quiser liberar para qualquer conta do mundo:

1. Menu lateral → **"Revisão do app" / "App Review"**
2. Solicitar acesso avançado para `instagram_business_basic`
3. Preencher: descrição de uso, política de privacidade (URL do site), termos de uso, vídeo de demo
4. Meta revisa em 1-5 dias úteis

### 4.8. Configurar no painel admin

Acesse `https://seu-dominio.com.br/admin/` e vá em **Configurações → Instagram (sincronização automática)**.

Preencha:

| Campo | Valor |
|---|---|
| `INSTAGRAM_APP_ID` | App ID do item 4.2 |
| `INSTAGRAM_APP_SECRET` | App Secret (criptografado no banco) |
| `INSTAGRAM_REDIRECT_URI` | `https://seu-dominio.com.br/api/instagram/callback` |
| `INSTAGRAM_AUTH_MODE` | `instagram` (default) ou `facebook` (legado) |
| `INSTAGRAM_SYNC_INTERVAL_MIN` | Intervalo do cron (mínimo 5, default 30) |
| `INSTAGRAM_AUTO_IMPORT` | `1` ativa, `0` desativa |

### 4.9. Conectar

1. No mesmo card, clique em **"Conectar Instagram"**
2. Abre a tela de login do Instagram
3. Nilma digita usuário/senha de `@advnilmaalves`
4. Autoriza o app
5. Volta para o painel com mensagem de sucesso

### 4.10. Sincronizar

- **Manual:** clique em **"Sincronizar agora"**
- **Automático:** o cron roda a cada `INSTAGRAM_SYNC_INTERVAL_MIN` minutos e importa novos posts
- Os posts aparecem na seção **"ÚLTIMOS CONTEÚDOS"** da home pública
- Você pode **ocultar** posts individuais no painel (não apaga do Instagram, só esconde do site)

---

## 5. Modo de autenticação alternativo: Facebook Login (legado)

Se a Nilma preferir (ou se Business Login der problema), use o modo Facebook:

1. Adicione o produto **"Login do Facebook"** ao app
2. Vincule uma **Página do Facebook** à conta Business do Instagram dela
3. No painel admin, troque `INSTAGRAM_AUTH_MODE` para `facebook`
4. Reinicie o servidor
5. Reconecte pelo painel

> Modo Facebook é mais antigo, exige Página do Facebook e é mais burocrático. Use Business Login (default) sempre que possível.

---

## 6. Estrutura do projeto

```
.
├── index.html                # Home pública
├── assets/                   # Imagens e mídias
├── admin/                    # Painel administrativo (HTML/CSS/JS estático)
│   ├── index.html
│   ├── admin.css
│   └── admin.js
├── server/
│   ├── index.js              # Bootstrap Express
│   ├── lib/
│   │   ├── db.js             # better-sqlite3 + migrations
│   │   ├── settings.js       # Configurações criptografadas
│   │   ├── auth.js           # Sessão admin
│   │   ├── apiKey.js         # API keys para sistemas externos
│   │   ├── posts.js          # CRUD de blog
│   │   ├── storage.js        # Upload de imagens
│   │   ├── instagram.js      # OAuth + Graph API
│   │   └── instagramSync.js  # Sync + cron
│   ├── routes/
│   │   ├── public-posts.js
│   │   ├── admin-posts.js
│   │   ├── admin-api-keys.js
│   │   ├── admin-settings.js
│   │   ├── instagram.js          # admin
│   │   ├── instagram-public.js   # home
│   │   ├── instagram-callback.js # OAuth callback
│   │   └── google.js             # Google reviews (similar ao Instagram)
│   └── data/                # SQLite + uploads (gitignored)
└── package.json
```

---

## 7. Deploy em produção

### 7.1. Servidor

- **Node.js 20 LTS** em VPS (Hostinger, DigitalOcean, etc.)
- **PM2** para gerenciar o processo:
  ```bash
  npm install -g pm2
  pm2 start server/index.js --name nilma-site
  pm2 save
  pm2 startup
  ```
- **Nginx** como reverse proxy + HTTPS (Let's Encrypt via certbot)
- O SQLite fica em `server/data/blog.db` — **faça backup diário**

### 7.2. Domínio e HTTPS

- Apontar `seu-dominio.com.br` para o IP do servidor (registro A)
- Certbot para certificado:
  ```bash
  sudo certbot --nginx -d seu-dominio.com.br
  ```
- Configurar o Nginx para proxy_pass para `http://127.0.0.1:3001` e headers de WebSocket se necessário

### 7.3. Checklist pós-deploy

- [ ] `git pull` da branch correta
- [ ] `npm install` (atualizar deps)
- [ ] `pm2 restart nilma-site`
- [ ] Confirmar que `https://seu-dominio.com.br/` abre
- [ ] Acessar `/admin/` e trocar a senha padrão
- [ ] Configurar `INSTAGRAM_*` em Configurações
- [ ] Conectar Instagram pelo painel
- [ ] Testar sincronização manual
- [ ] Conferir a home pública — seção "Últimos Conteúdos" deve aparecer
- [ ] Configurar backup automático do SQLite

---

## 8. API para sistemas externos

A landing page expõe uma API REST autenticada por header `X-API-Key` para criar posts no blog a partir de outros sistemas (CRM, ERP, etc.).

- **Documentação interativa:** `/api/docs` (Swagger)
- **Gerar chave:** painel admin → Configurações → API Keys (sistemas externos)
- **Endpoints públicos:** `/api/public/posts`, `/api/public/posts/:slug`
- **Endpoints admin:** `/api/admin/posts` (GET/POST/PUT/DELETE) — requerem `X-API-Key`

Exemplo de criação de post:

```bash
curl -X POST https://seu-dominio.com.br/api/admin/posts \
  -H "X-API-Key: SUA_CHAVE_AQUI" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Título do post",
    "slug": "titulo-do-post",
    "excerpt": "Resumo",
    "content": "<p>Conteúdo HTML</p>",
    "status": "published"
  }'
```

---

## 9. Solução de problemas

### Instagram retorna "Invalid redirect_uri"
- Verifique se a URI no Meta (em "Valid OAuth Redirect URIs") é **idêntica** à do `INSTAGRAM_REDIRECT_URI` no banco (esquema, host, porta, path)
- Para dev: o Meta aceita `http://localhost:3001/...` automaticamente
- Para produção: precisa ser HTTPS e domínio validado

### Instagram retorna "Função de desenvolvedor é insuficiente"
- A conta logada no Facebook precisa ter permissão de Admin/Developer no app
- Se o app foi criado em uma conta e a conta do Instagram é outra, crie o app na conta certa

### Token do Instagram expirado
- O token de longa duração vale ~60 dias
- O `instagramSync` renova automaticamente se estiver próximo do vencimento
- Se aparecer "Session expired", clique em "Desconectar" e conecte novamente

### Posts do Instagram não aparecem na home
- Verifique se há posts não ocultos: `GET /api/admin/instagram/posts` (autenticado)
- Verifique se o cron está rodando: olhe os logs do servidor
- Force sincronização manual: clique em "Sincronizar agora" no painel
- Veja se `INSTAGRAM_AUTO_IMPORT=1` no banco

### Banco de dados corrompido
- O `better-sqlite3` é resistente, mas em caso de corrupção, pare o servidor, faça backup do `data/blog.db`, e restaure de um snapshot anterior

---

## 10. Licença

Propriedade de KBO Soluções — uso restrito ao cliente Dra. Nilma Alves.
