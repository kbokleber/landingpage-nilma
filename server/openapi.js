const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Nilma Alves — Blog API',
    version: '1.0.0',
    description: 'API REST para gerenciar posts do blog da Dra. Nilma Alves. Requer API Key no header `X-API-Key`.',
    contact: { name: 'KBO Soluções', url: 'https://kbosolucoes.com.br' },
  },
  servers: [
    { url: 'http://127.0.0.1:3001', description: 'Local' },
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
          title: { type: 'string' },
          excerpt: { type: 'string' },
          contentHtml: { type: 'string' },
          coverImage: { type: 'string' },
          author: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          status: {
            type: 'string',
            enum: ['draft', 'published', 'archived'],
            description: 'Opcional. Padrão: draft. Sistemas externos podem enviar "published" para criar já público após revisão.',
          },
        },
      },
      ApiKey: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          prefix: { type: 'string', example: 'nilma_abc12345' },
          createdAt: { type: 'string', format: 'date-time' },
          lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
          revoked: { type: 'boolean' },
          key: { type: 'string', description: 'Retornado apenas no momento da criação' },
        },
      },
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
      },
    },
  },
  security: [{ ApiKeyAuth: [] }],
  paths: {
    '/api/v1/posts': {
      get: {
        tags: ['Posts'],
        summary: 'Listar posts publicados',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          { name: 'tag', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: {
            description: 'Lista de posts',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer' },
                    limit: { type: 'integer' },
                    offset: { type: 'integer' },
                    items: { type: 'array', items: { $ref: '#/components/schemas/Post' } },
                  },
                },
              },
            },
          },
          401: { description: 'API Key inválida', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          429: { description: 'Rate limit excedido' },
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
    '/api/v1/posts/{slug}': {
      get: {
        tags: ['Posts'],
        summary: 'Obter post por slug',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
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
    '/api/v1/posts/{id}/images': {
      post: {
        tags: ['Imagens'],
        summary: 'Upload de imagem (multipart/form-data)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
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
  },
};

module.exports = spec;
