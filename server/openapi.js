const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Nilma Alves — Blog & Depoimentos API',
    version: '1.2.0',
    description: [
      'API REST para sistemas externos alimentarem o **blog** e os **depoimentos** da Dra. Nilma Alves.',
      '',
      '**Autenticação:** envie o header `X-API-Key` em todas as rotas `/api/v1/*`.',
      '',
      '**Como obter a chave:** no painel admin → Configurações → Site → API Keys.',
      '',
      'APIs públicas (sem chave): `/api/public/posts` e `/api/public/reviews`.',
    ].join('\n'),
    contact: { name: 'KBO Soluções', url: 'https://kbosolucoes.com.br' },
  },
  servers: [
    { url: 'http://127.0.0.1:3001', description: 'Local (dev)' },
    { url: 'https://SEU_DOMINIO_AQUI', description: 'Produção (substituir pelo domínio real)' },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    },
    schemas: {
      Post: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          slug: { type: 'string', example: 'novidades-direito-imobiliario-2026' },
          title: { type: 'string', example: 'Novidades do direito imobiliário em 2026' },
          excerpt: { type: 'string', example: 'Resumo curto do post...' },
          contentHtml: { type: 'string', example: '<p>Conteúdo do post...</p>' },
          coverImage: { type: 'string', example: '/uploads/blog/capa-123.jpg' },
          author: { type: 'string', example: 'Dra. Nilma Alves' },
          tags: { type: 'array', items: { type: 'string' }, example: ['imobiliario', '2026'] },
          status: { type: 'string', enum: ['draft', 'published', 'archived'] },
          publishedAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          images: {
            type: 'array',
            items: { $ref: '#/components/schemas/PostImage' },
          },
        },
      },
      PostImage: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          url: { type: 'string', example: '/uploads/blog/foto-1.jpg' },
          alt: { type: 'string' },
          position: { type: 'integer' },
        },
      },
      PostInput: {
        type: 'object',
        required: ['title', 'contentHtml'],
        properties: {
          title: { type: 'string', description: 'Obrigatório. O slug é gerado automaticamente a partir do título.' },
          excerpt: { type: 'string', description: 'Resumo curto (listagem do blog).' },
          contentHtml: {
            type: 'string',
            description: 'HTML do corpo. É sanitizado no servidor (scripts e handlers são removidos).',
          },
          coverImage: { type: 'string', description: 'URL da capa (ex.: após upload em /cover).' },
          author: { type: 'string', description: 'Padrão: Dra. Nilma Alves' },
          tags: { type: 'array', items: { type: 'string' } },
          status: {
            type: 'string',
            enum: ['draft', 'published', 'archived'],
            description: 'Opcional. Padrão: draft. Use "published" para criar já público.',
          },
        },
      },
      PostList: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
          status: { type: 'string' },
          items: { type: 'array', items: { $ref: '#/components/schemas/Post' } },
        },
      },
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
      },
      Review: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'a0d2ed62-7b90-494c-aa48-a201b35e5d4b' },
          author: { type: 'string', example: 'Maria S.' },
          authorName: { type: 'string', example: 'Maria S.' },
          rating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
          text: { type: 'string', example: 'Excelente atendimento.' },
          area: { type: 'string', example: 'Direito de Família' },
          publishedAt: { type: 'string', example: '2026-09-12' },
          visible: { type: 'boolean', example: true },
          siteStatus: { type: 'string', enum: ['draft', 'published'], example: 'draft' },
          source: { type: 'string', example: 'api' },
          order: { type: 'integer', example: 1 },
        },
      },
      ReviewInput: {
        type: 'object',
        required: ['text'],
        properties: {
          author: { type: 'string', description: 'Nome do autor (ou use authorName)' },
          authorName: { type: 'string' },
          text: { type: 'string' },
          rating: { type: 'integer', minimum: 1, maximum: 5, default: 5 },
          area: { type: 'string', description: 'Ex.: Direito de Família, Sucessões, Imobiliário' },
          visible: { type: 'boolean', default: true },
          siteStatus: {
            type: 'string',
            enum: ['draft', 'published'],
            default: 'draft',
            description: 'Rascunho não aparece no site. published = visível após gerar o JSON público.',
          },
          status: {
            type: 'string',
            enum: ['draft', 'published'],
            description: 'Alias de siteStatus (compatível com posts).',
          },
          publish: {
            type: 'boolean',
            default: false,
            description: 'Se true, publica imediatamente no site (siteStatus=published).',
          },
        },
      },
    },
  },
  security: [{ ApiKeyAuth: [] }],
  paths: {
    '/api/v1/posts': {
      get: {
        tags: ['Posts'],
        summary: 'Listar posts',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          { name: 'tag', in: 'query', schema: { type: 'string' } },
          {
            name: 'status',
            in: 'query',
            description: 'Filtro de status. Padrão: published. Use all para todos.',
            schema: { type: 'string', enum: ['published', 'draft', 'archived', 'all'], default: 'published' },
          },
        ],
        responses: {
          200: {
            description: 'Lista de posts',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PostList' } } },
          },
          401: { description: 'API Key inválida', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          429: { description: 'Rate limit excedido (60 req/min por IP)' },
        },
      },
      post: {
        tags: ['Posts'],
        summary: 'Criar post',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/PostInput' } } },
        },
        responses: {
          201: { description: 'Post criado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Post' } } } },
          400: { description: 'Dados inválidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/v1/posts/{slugOrId}': {
      get: {
        tags: ['Posts'],
        summary: 'Obter post por slug ou por ID',
        parameters: [{
          name: 'slugOrId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Slug (ex.: meu-post) ou ID numérico (ex.: 5). Com API Key, retorna qualquer status.',
        }],
        responses: {
          200: { description: 'Post', content: { 'application/json': { schema: { $ref: '#/components/schemas/Post' } } } },
          404: { description: 'Não encontrado' },
        },
      },
    },
    '/api/v1/posts/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      put: {
        tags: ['Posts'],
        summary: 'Atualizar post',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PostInput' } } } },
        responses: { 200: { description: 'OK' }, 404: { description: 'Não encontrado' } },
      },
      delete: {
        tags: ['Posts'],
        summary: 'Remover post',
        responses: { 200: { description: 'OK' }, 404: { description: 'Não encontrado' } },
      },
    },
    '/api/v1/posts/{id}/publish': {
      post: {
        tags: ['Posts'],
        summary: 'Publicar post',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Não encontrado' } },
      },
    },
    '/api/v1/posts/{id}/unpublish': {
      post: {
        tags: ['Posts'],
        summary: 'Voltar para rascunho',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Não encontrado' } },
      },
    },
    '/api/v1/posts/{id}/archive': {
      post: {
        tags: ['Posts'],
        summary: 'Arquivar post',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Não encontrado' } },
      },
    },
    '/api/v1/posts/{id}/cover': {
      post: {
        tags: ['Imagens'],
        summary: 'Upload da capa do post (multipart/form-data)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['cover'],
                properties: {
                  cover: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Capa atualizada' }, 400: { description: 'Arquivo inválido' } },
      },
    },
    '/api/v1/posts/{id}/images': {
      post: {
        tags: ['Imagens'],
        summary: 'Upload de imagem da galeria (multipart/form-data)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['image'],
                properties: {
                  image: { type: 'string', format: 'binary' },
                  alt: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Imagem criada' }, 400: { description: 'Arquivo inválido' } },
      },
    },
    '/api/v1/tags': {
      get: {
        tags: ['Tags'],
        summary: 'Listar tags únicas',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/api/v1/reviews': {
      get: {
        tags: ['Depoimentos'],
        summary: 'Listar depoimentos',
        parameters: [
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['all', 'draft', 'published'], default: 'all' },
            description: 'Filtrar por siteStatus (rascunho / publicado).',
          },
        ],
        responses: {
          200: { description: 'Lista de depoimentos' },
          401: { description: 'API Key inválida' },
        },
      },
      post: {
        tags: ['Depoimentos'],
        summary: 'Criar depoimento',
        description: 'Cria como rascunho por padrão. Envie publish=true ou siteStatus=published para já publicar no site.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ReviewInput' } } },
        },
        responses: {
          201: { description: 'Depoimento criado' },
          400: { description: 'Dados inválidos' },
        },
      },
    },
    '/api/v1/reviews/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        tags: ['Depoimentos'],
        summary: 'Obter depoimento por ID',
        responses: { 200: { description: 'OK' }, 404: { description: 'Não encontrado' } },
      },
      put: {
        tags: ['Depoimentos'],
        summary: 'Atualizar depoimento',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ReviewInput' } } },
        },
        responses: { 200: { description: 'OK' }, 404: { description: 'Não encontrado' } },
      },
      delete: {
        tags: ['Depoimentos'],
        summary: 'Remover depoimento',
        responses: { 200: { description: 'OK' }, 404: { description: 'Não encontrado' } },
      },
    },
    '/api/v1/reviews/{id}/publish': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      post: {
        tags: ['Depoimentos'],
        summary: 'Publicar depoimento',
        description: 'Define siteStatus=published e regenera assets/reviews.json.',
        responses: { 200: { description: 'Publicado' }, 404: { description: 'Não encontrado' } },
      },
    },
    '/api/v1/reviews/{id}/unpublish': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      post: {
        tags: ['Depoimentos'],
        summary: 'Voltar depoimento para rascunho',
        description: 'Define siteStatus=draft e regenera assets/reviews.json (sai do site).',
        responses: { 200: { description: 'OK' }, 404: { description: 'Não encontrado' } },
      },
    },
    '/api/v1/reviews/publish': {
      post: {
        tags: ['Depoimentos'],
        summary: 'Republicar lista no site',
        description: 'Gera assets/reviews.json a partir dos depoimentos com siteStatus=published.',
        responses: { 200: { description: 'Publicado' } },
      },
    },
    '/api/public/reviews': {
      get: {
        tags: ['Depoimentos'],
        summary: 'Listar depoimentos publicados (sem autenticação)',
        security: [],
        responses: { 200: { description: 'OK' } },
      },
    },
  },
};

module.exports = spec;
