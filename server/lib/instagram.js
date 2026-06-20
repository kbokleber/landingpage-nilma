const settings = require('./settings');
const {
  readInstagramTokens,
  writeInstagramTokens,
  clearInstagramTokens,
} = require('./storage');

const GRAPH_API_VERSION = 'v23.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
// Business Login for Instagram (login direto com @advnilmaalves)
const IG_OAUTH_BASE = 'https://api.instagram.com/oauth';
// Facebook Login (legado, requer Página do Facebook vinculada)
const FB_OAUTH_BASE = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth`;

function getAuthMode() {
  try {
    return settings.get('INSTAGRAM_AUTH_MODE') || 'instagram';
  } catch {
    return 'instagram';
  }
}

function getConfig(key) {
  try {
    const v = settings.get(key);
    if (v) return v;
  } catch {}
  return process.env[key] || '';
}

function getRedirectUri() {
  return getConfig('INSTAGRAM_REDIRECT_URI') ||
    `http://127.0.0.1:3001/api/instagram/callback`;
}

function isConfigured() {
  return Boolean(getConfig('INSTAGRAM_APP_ID') && getConfig('INSTAGRAM_APP_SECRET'));
}

function isConnected() {
  const t = readInstagramTokens();
  return Boolean(t && (t.access_token || t.long_lived_token));
}

function buildAuthUrl(state = '') {
  const appId = getConfig('INSTAGRAM_APP_ID');
  const redirect = getRedirectUri();
  if (!appId) throw new Error('INSTAGRAM_APP_ID não configurado.');
  const mode = getAuthMode();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirect,
    state,
    response_type: 'code',
  });
  if (mode === 'instagram') {
    // Business Login for Instagram — login direto com a conta do Instagram
    // https://developers.facebook.com/docs/instagram-platform/business-login
    params.set('scope', 'instagram_business_basic');
    params.set('enable_fb_login', 'false');
    params.set('force_authentication', 'true');
    return `${IG_OAUTH_BASE}/authorize?${params.toString()}`;
  }
  // Facebook Login (legado) — exige Página do Facebook vinculada
  params.set('scope', 'instagram_basic,pages_show_list,pages_read_engagement');
  return `${FB_OAUTH_BASE}?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const appId = getConfig('INSTAGRAM_APP_ID');
  const appSecret = getConfig('INSTAGRAM_APP_SECRET');
  const redirect = getRedirectUri();
  if (!appId || !appSecret) {
    throw new Error('INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET não configurados.');
  }
  const mode = getAuthMode();
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirect,
    code,
  });
  let res;
  let data;
  if (mode === 'instagram') {
    // Business Login for Instagram exige POST com x-www-form-urlencoded
    res = await fetch(`${IG_OAUTH_BASE}/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
  } else {
    // Facebook Login: aceita GET com query string
    res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  }
  data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `Falha ao trocar code por token (HTTP ${res.status}).`);
  }
  return data; // { access_token, user_id (instagram) | sem user_id (facebook) }
}

async function exchangeForLongLivedToken(shortToken) {
  const appId = getConfig('INSTAGRAM_APP_ID');
  const appSecret = getConfig('INSTAGRAM_APP_SECRET');
  const mode = getAuthMode();
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: mode === 'instagram' ? 'ig_exchange_token' : 'fb_exchange_token',
  });
  if (mode === 'instagram') {
    params.set('access_token', shortToken);
  } else {
    params.set('fb_exchange_token', shortToken);
  }
  // Long-lived tokens são sempre via graph.facebook.com (até para IG)
  const url = `${GRAPH_BASE}/access_token?${params.toString()}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || 'Falha ao obter token de longa duração.');
  }
  return data; // { access_token, token_type, expires_in: ~5184000 (60 dias) }
}

async function findInstagramBusinessAccount(accessToken) {
  const mode = getAuthMode();
  if (mode === 'instagram') {
    // Business Login já retorna o IG user_id no /access_token
    // Mas se não veio, tenta /me via graph.instagram.com
    let igUserId = null;
    try {
      const meRes = await fetch(`${IG_OAUTH_BASE}/me?access_token=${encodeURIComponent(accessToken)}`);
      const meData = await meRes.json().catch(() => ({}));
      igUserId = meData?.id || meData?.user_id || null;
    } catch {}
    return { pageId: null, pageName: null, igUserId };
  }
  // Facebook Login: precisa achar a Página do Facebook com ig_business_account
  const pagesUrl = `${GRAPH_BASE}/me/accounts?fields=id,name,instagram_business_account&access_token=${encodeURIComponent(accessToken)}`;
  const pagesRes = await fetch(pagesUrl);
  const pagesData = await pagesRes.json().catch(() => ({}));
  if (!pagesRes.ok || pagesData.error) {
    throw new Error(pagesData.error?.message || 'Falha ao listar páginas do Facebook.');
  }
  const pages = pagesData.data || [];
  for (const page of pages) {
    if (page.instagram_business_account && page.instagram_business_account.id) {
      return { pageId: page.id, pageName: page.name, igUserId: page.instagram_business_account.id };
    }
  }
  if (pages.length > 0) {
    return { pageId: pages[0].id, pageName: pages[0].name, igUserId: null };
  }
  throw new Error('Nenhuma Página do Facebook encontrada. Vincule sua Página ao Instagram Business/Creator e autorize o app a acessá-la.');
}

function getAccessToken() {
  const t = readInstagramTokens();
  if (!t) return null;
  return t.long_lived_token || t.access_token || null;
}

function getExpiresAt() {
  const t = readInstagramTokens();
  return t?.expires_at ? Number(t.expires_at) : null;
}

function isTokenExpiringSoon() {
  const exp = getExpiresAt();
  if (!exp) return false;
  return Date.now() / 1000 > exp - 7 * 24 * 60 * 60; // <7 dias
}

async function refreshLongLivedToken() {
  const current = getAccessToken();
  if (!current) throw new Error('Sem token para renovar.');
  const mode = getAuthMode();
  const params = new URLSearchParams({
    client_id: getConfig('INSTAGRAM_APP_ID'),
    client_secret: getConfig('INSTAGRAM_APP_SECRET'),
  });
  if (mode === 'instagram') {
    // Business Login for Instagram: ig_exchange_token
    params.set('grant_type', 'ig_exchange_token');
    params.set('access_token', current);
  } else {
    // Facebook Login legado
    params.set('grant_type', 'fb_exchange_token');
    params.set('fb_exchange_token', current);
  }
  const url = `${GRAPH_BASE}/oauth/access_token?${params.toString()}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || 'Falha ao renovar token.');
  }
  const prev = readInstagramTokens() || {};
  const expiresAt = data.expires_in ? Math.floor(Date.now() / 1000) + Number(data.expires_in) : null;
  writeInstagramTokens({ ...prev, long_lived_token: data.access_token, expires_at: expiresAt });
  return data;
}

async function graphGet(path, params = {}) {
  const token = getAccessToken();
  if (!token) throw new Error('Instagram não conectado.');
  if (isTokenExpiringSoon()) {
    try { await refreshLongLivedToken(); } catch { /* tenta mesmo assim */ }
  }
  const url = new URL(`${GRAPH_BASE}${path}`);
  Object.entries({ ...params, access_token: getAccessToken() }).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString());
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `Graph API falhou (HTTP ${res.status}) em ${path}.`);
  }
  return data;
}

async function fetchRecentMedia({ igUserId, limit = 20, after = null } = {}) {
  const userId = igUserId || getConfig('INSTAGRAM_IG_USER_ID');
  if (!userId) throw new Error('INSTAGRAM_IG_USER_ID não definido. Reconecte o Instagram.');
  const params = {
    fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_url,media_type}',
    limit: Math.min(50, Math.max(1, Number(limit) || 20)),
  };
  if (after) params.after = after;
  const data = await graphGet(`/${userId}/media`, params);
  return {
    items: data.data || [],
    paging: data.paging || null,
  };
}

async function handleOAuthCallback(code) {
  const short = await exchangeCodeForToken(code);
  let accessToken = short.access_token;
  let expiresAt = short.expires_in ? Math.floor(Date.now() / 1000) + Number(short.expires_in) : null;
  // Business Login retorna user_id junto
  const igUserIdFromToken = short.user_id ? String(short.user_id) : null;

  let longLived = null;
  try {
    longLived = await exchangeForLongLivedToken(short.access_token);
    accessToken = longLived.access_token;
    expiresAt = longLived.expires_in ? Math.floor(Date.now() / 1000) + Number(longLived.expires_in) : null;
  } catch (err) {
    longLived = null;
  }

  const account = await findInstagramBusinessAccount(accessToken);
  const finalIgUserId = igUserIdFromToken || account.igUserId;

  const stored = {
    access_token: longLived ? null : short.access_token,
    long_lived_token: longLived ? longLived.access_token : null,
    expires_at: expiresAt,
    page_id: account.pageId,
    page_name: account.pageName || null,
    ig_user_id: finalIgUserId,
    auth_mode: getAuthMode(),
    connected_at: new Date().toISOString(),
  };
  writeInstagramTokens(stored);

  try {
    if (account.pageId) settings.setMany([{ key: 'INSTAGRAM_PAGE_ID', value: account.pageId }]);
    if (finalIgUserId) settings.setMany([{ key: 'INSTAGRAM_IG_USER_ID', value: finalIgUserId }]);
  } catch {}

  return stored;
}

function disconnect() {
  clearInstagramTokens();
  try {
    settings.setMany([
      { key: 'INSTAGRAM_PAGE_ID', value: '' },
      { key: 'INSTAGRAM_IG_USER_ID', value: '' },
    ]);
  } catch {}
}

async function downloadMedia(url, destPath) {
  const fs = require('fs');
  const path = require('path');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar mídia: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  return destPath;
}

module.exports = {
  GRAPH_API_VERSION,
  isConfigured,
  isConnected,
  buildAuthUrl,
  handleOAuthCallback,
  refreshLongLivedToken,
  fetchRecentMedia,
  disconnect,
  downloadMedia,
  getAccessToken,
  getExpiresAt,
  getAuthMode,
};
