const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..', '..');
const DB_DIR = path.join(ROOT, 'data');
const DEFAULT_DB_PATH = path.join(DB_DIR, 'blog.db');

function resolveDbPath() {
  let configured = '';
  try { configured = require('./settings').get('BLOG_DB_PATH') || ''; } catch {}
  if (configured) {
    if (path.isAbsolute(configured)) return configured;
    return path.join(ROOT, configured);
  }
  if (process.env.BLOG_DB_PATH) {
    return path.isAbsolute(process.env.BLOG_DB_PATH)
      ? process.env.BLOG_DB_PATH
      : path.join(ROOT, process.env.BLOG_DB_PATH);
  }
  return DEFAULT_DB_PATH;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

let _db = null;
let _dbPath = null;

function getDb() {
  if (_db) return _db;
  _dbPath = resolveDbPath();
  ensureDir(path.dirname(_dbPath));
  _db = new Database(_dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      excerpt TEXT,
      content_html TEXT NOT NULL,
      cover_image TEXT,
      author TEXT DEFAULT 'Dra. Nilma Alves',
      tags TEXT,
      status TEXT DEFAULT 'draft',
      published_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at);

    CREATE TABLE IF NOT EXISTS post_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      alt TEXT,
      position INTEGER DEFAULT 0,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_post_images_post_id ON post_images(post_id);

    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      key_encrypted TEXT,
      prefix TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      role TEXT DEFAULT 'admin',
      active INTEGER DEFAULT 1,
      last_login_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  `);

  // Migrações idempotentes (ALTER TABLE seguro)
  const apiKeysCols = db.prepare("PRAGMA table_info(api_keys)").all();
  if (!apiKeysCols.find((c) => c.name === 'key_encrypted')) {
    db.exec('ALTER TABLE api_keys ADD COLUMN key_encrypted TEXT');
  }

  const postsCols = db.prepare("PRAGMA table_info(posts)").all();
  if (!postsCols.find((c) => c.name === 'publish_at')) {
    db.exec('ALTER TABLE posts ADD COLUMN publish_at DATETIME');
  }
  if (!postsCols.find((c) => c.name === 'seo_title')) {
    db.exec('ALTER TABLE posts ADD COLUMN seo_title TEXT');
  }
  if (!postsCols.find((c) => c.name === 'cover_alt')) {
    db.exec('ALTER TABLE posts ADD COLUMN cover_alt TEXT');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_posts_publish_at ON posts(publish_at)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS post_slug_redirects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      old_slug TEXT UNIQUE NOT NULL,
      post_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_post_slug_redirects_post_id ON post_slug_redirects(post_id);
  `);

  migrateSeoSlugs(db);
}

const SEO_SLUG_MIGRATIONS = [
  {
    id: 17,
    oldSlug: 'a-familia-quer-vender-o-apartamento-da-praia-mas-o-inventario-ainda-nao-terminou-e-agora',
    newSlug: 'vender-imovel-durante-inventario',
    seoTitle: 'Vender imóvel durante o inventário: 3 caminhos | Nilma Alves',
  },
  {
    id: 16,
    oldSlug: 'meu-pai-esta-esquecendo-as-coisas-ainda-da-tempo-de-organizar-a-vida-dele',
    newSlug: 'pais-idosos-perdendo-a-lucidez',
    seoTitle: 'Pais idosos perdendo a lucidez: o que fazer | Nilma Alves',
  },
  {
    id: 15,
    oldSlug: 'a-familia-tem-a-casa-mas-nao-tem-dinheiro-para-o-imposto-o-inventario-precisa-esperar',
    newSlug: 'inventario-sem-pagar-itcmd-antes',
    seoTitle: 'Inventário sem pagar ITCMD antes: o que mudou | Nilma Alves',
  },
  {
    id: 9,
    oldSlug: 'voces-moram-juntos-ha-6-anos-e-nunca-formalizaram-nada-so-que-para-a-lei-isso-ja-aconteceu-sozinho',
    newSlug: 'uniao-estavel-sem-formalizar',
    seoTitle: 'União estável sem papel: o que a lei reconhece | Nilma Alves',
  },
  {
    id: 7,
    oldSlug: 'ela-escreveu-um-testamento-deixando-tudo-para-uma-so-filha-a-lei-disse-que-so-metade-disso-era-dela-para-decidir',
    newSlug: 'testamento-e-legitima',
    seoTitle: 'Testamento e legítima: quanto posso deixar a um filho?',
  },
  {
    id: 6,
    oldSlug: 'a-casa-da-familia-ainda-esta-no-nome-do-seu-avo-que-morreu-ha-8-anos-isso-pode-custar-mais-caro-do-que-voce-imagina',
    newSlug: 'imovel-no-nome-de-quem-morreu',
    seoTitle: 'Imóvel no nome de quem morreu: o que fazer | Nilma Alves',
  },
  {
    id: 1,
    oldSlug: 'se-voce-tem-imoveis-precisa-pensar-em-sucessao-antes-do-inventario',
    newSlug: 'sucessao-de-imoveis-antes-do-inventario',
    seoTitle: 'Sucessão de imóveis antes do inventário | Nilma Alves',
  },
];

function migrateSeoSlugs(db) {
  const getById = db.prepare('SELECT id, slug FROM posts WHERE id = ?');
  const update = db.prepare(`
    UPDATE posts
    SET slug = @newSlug,
        seo_title = @seoTitle,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);
  const insertRedirect = db.prepare(`
    INSERT OR IGNORE INTO post_slug_redirects (old_slug, post_id)
    VALUES (@oldSlug, @postId)
  `);

  const tx = db.transaction(() => {
    for (const item of SEO_SLUG_MIGRATIONS) {
      const row = getById.get(item.id);
      if (!row) continue;
      const currentSlug = row.slug;
      if (currentSlug !== item.newSlug) {
        insertRedirect.run({ oldSlug: currentSlug, postId: item.id });
        if (item.oldSlug && item.oldSlug !== currentSlug) {
          insertRedirect.run({ oldSlug: item.oldSlug, postId: item.id });
        }
        update.run({ id: item.id, newSlug: item.newSlug, seoTitle: item.seoTitle });
      } else {
        insertRedirect.run({ oldSlug: item.oldSlug, postId: item.id });
        db.prepare('UPDATE posts SET seo_title = COALESCE(NULLIF(seo_title, \'\'), ?) WHERE id = ?')
          .run(item.seoTitle, item.id);
      }
    }
  });
  tx();
}

function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = { getDb, closeDb, get dbPath() { return _dbPath || resolveDbPath(); } };
