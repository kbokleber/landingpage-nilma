const loginView = document.getElementById('login-view');
const panelView = document.getElementById('panel-view');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const flash = document.getElementById('flash');
const googleStatus = document.getElementById('google-status');
const googleNextStep = document.getElementById('google-next-step');
const connectGoogleBtn = document.getElementById('connect-google-btn');
const discoverLocationsBtn = document.getElementById('discover-locations-btn');
const locationPicker = document.getElementById('location-picker');
const syncBtn = document.getElementById('sync-btn');
const publishBtn = document.getElementById('publish-btn');
const reviewList = document.getElementById('review-list');
const itemCount = document.getElementById('item-count');
const manualAuthor = document.getElementById('manual-author');
const manualRating = document.getElementById('manual-rating');
const manualText = document.getElementById('manual-text');
const addManualBtn = document.getElementById('add-manual-btn');

let draft = null;
let token = localStorage.getItem('admin_token') || '';

function showFlash(text, type = 'info') {
  flash.textContent = text;
  flash.className = `message ${type}`;
  flash.classList.remove('hidden');
}

function hideFlash() {
  flash.classList.add('hidden');
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers, credentials: 'include' });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Erro na requisição.');
  }
  return data;
}

function stars(n) {
  const count = Math.max(0, Math.min(5, Number(n) || 0));
  return '★'.repeat(count) + '☆'.repeat(5 - count);
}

function badgesForItem(item) {
  const badges = [];
  if (item.source === 'manual') badges.push('<span class="badge manual">Manual</span>');
  if (item.editedFields?.length) badges.push('<span class="badge edited">Editado</span>');
  if (item.status === 'removed_from_google') badges.push('<span class="badge removed">Removido no Google</span>');
  if (item.visible === false) badges.push('<span class="badge hidden">Oculto</span>');
  return badges.join('');
}

function renderDraft() {
  if (!draft) return;
  itemCount.textContent = String(draft.items.length);

  if (!draft.items.length) {
    reviewList.innerHTML = '<p class="sub">Nenhum depoimento no rascunho. Sincronize com o Google ou adicione manualmente.</p>';
    return;
  }

  const sorted = [...draft.items].sort((a, b) => (a.order || 0) - (b.order || 0));

  reviewList.innerHTML = sorted.map((item) => `
    <article class="review-item ${item.visible === false ? 'is-hidden' : ''}" data-id="${item.id}">
      <div class="review-head">
        <strong>${escapeHtml(item.author)}</strong>
        <span class="stars" aria-label="${item.rating} estrelas">${stars(item.rating)}</span>
        ${badgesForItem(item)}
        ${item.publishedAt ? `<span class="sub" style="margin:0">${item.publishedAt}</span>` : ''}
      </div>
      <textarea data-field="text" aria-label="Texto do depoimento">${escapeHtml(item.text)}</textarea>
      <div class="grid-2">
        <div>
          <label>Autor</label>
          <input type="text" data-field="author" value="${escapeAttr(item.author)}">
        </div>
        <div>
          <label>Ordem</label>
          <input type="number" data-field="order" min="1" value="${item.order || 1}">
        </div>
      </div>
      <div class="review-actions">
        <button class="btn secondary" type="button" data-action="save">Salvar alterações</button>
        <button class="btn outline" type="button" data-action="toggle">${item.visible === false ? 'Exibir' : 'Ocultar'}</button>
        <button class="btn outline" type="button" data-action="up" aria-label="Subir">↑</button>
        <button class="btn outline" type="button" data-action="down" aria-label="Descer">↓</button>
      </div>
    </article>
  `).join('');

  reviewList.querySelectorAll('.review-item').forEach((el) => {
    const id = el.dataset.id;
    el.querySelector('[data-action="save"]').addEventListener('click', () => saveItem(id, el));
    el.querySelector('[data-action="toggle"]').addEventListener('click', () => toggleVisible(id));
    el.querySelector('[data-action="up"]').addEventListener('click', () => moveItem(id, -1));
    el.querySelector('[data-action="down"]').addEventListener('click', () => moveItem(id, 1));
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}

async function saveItem(id, el) {
  const payload = {
    author: el.querySelector('[data-field="author"]').value,
    text: el.querySelector('[data-field="text"]').value,
    order: Number(el.querySelector('[data-field="order"]').value),
  };
  draft = await api(`/api/draft/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  renderDraft();
  showFlash('Depoimento atualizado.', 'ok');
}

async function toggleVisible(id) {
  const item = draft.items.find((i) => i.id === id);
  if (!item) return;
  draft = await api(`/api/draft/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ visible: item.visible === false }),
  });
  renderDraft();
}

async function moveItem(id, direction) {
  const sorted = [...draft.items].sort((a, b) => (a.order || 0) - (b.order || 0));
  const index = sorted.findIndex((i) => i.id === id);
  const swapIndex = index + direction;
  if (swapIndex < 0 || swapIndex >= sorted.length) return;

  const currentOrder = sorted[index].order || index + 1;
  const swapOrder = sorted[swapIndex].order || swapIndex + 1;

  await api(`/api/draft/items/${sorted[index].id}`, {
    method: 'PATCH',
    body: JSON.stringify({ order: swapOrder }),
  });
  draft = await api(`/api/draft/items/${sorted[swapIndex].id}`, {
    method: 'PATCH',
    body: JSON.stringify({ order: currentOrder }),
  });
  draft = await api('/api/draft');
  renderDraft();
}

function formatApiError(message) {
  const text = String(message || '');
  if (text.includes('Quota exceeded') || text.includes('quota metric')) {
    return 'A API ainda não liberou cota para este projeto (0 requisições/min). Isso é normal enquanto o Google não aprova o formulário de acesso ao Business Profile. Aguarde o e-mail de aprovação — pode levar dias. Evite clicar várias vezes em «Descobrir perfil». Enquanto isso, adicione depoimentos manualmente e publique. Após aprovar: Cloud Console → Cotas → mybusinessaccountmanagement deve mostrar 300 QPM (não 0).';
  }
  if (text.includes('has not been used in project') || text.includes('is disabled')) {
    const match = text.match(/project (\d+)/);
    const project = match ? match[1] : '198494063026';
    return `Ative as APIs do Google Business no Cloud Console (projeto ${project}) e aguarde 2–5 minutos: Account Management, Business Information e Google My Business API.`;
  }
  return text;
}

async function loadGoogleStatus() {
  const status = await api('/api/google/status');
  googleStatus.innerHTML = `
    <span>Credenciais OAuth: <strong>${status.oauthConfigured ? 'Sim' : 'Não'}</strong></span>
    <span>Conectado: <strong>${status.connected ? 'Sim' : 'Não'}</strong></span>
    <span>Perfil selecionado: <strong>${status.locationConfigured ? 'Sim' : 'Não'}</strong></span>
    ${status.locationName ? `<span>Location: <code>${escapeHtml(status.locationName)}</code></span>` : ''}
  `;
  connectGoogleBtn.disabled = !status.oauthConfigured;
  discoverLocationsBtn.disabled = !status.connected;
  syncBtn.disabled = !status.connected || !status.locationConfigured;

  if (status.connected && !status.locationConfigured) {
    googleNextStep.textContent =
      'Conectado ao Google. Quando a API for aprovada, use «Descobrir perfil» → escolha o escritório → «Sincronizar». Se aparecer erro de cota, aguarde aprovação do formulário (Project Number 198494063026).';
    googleNextStep.classList.remove('hidden');
  } else if (status.locationConfigured) {
    googleNextStep.textContent = 'Perfil pronto. Use «Sincronizar todos» e depois «Publicar no site».';
    googleNextStep.classList.remove('hidden');
  } else {
    googleNextStep.classList.add('hidden');
  }
}

async function showPanel() {
  loginView.classList.add('hidden');
  panelView.classList.remove('hidden');
  draft = await api('/api/draft');
  renderDraft();
  await loadGoogleStatus();
}

async function tryAutoLogin() {
  try {
    const me = await api('/api/auth/me');
    if (me.authenticated) {
      await showPanel();
      return;
    }
  } catch {
    token = '';
    localStorage.removeItem('admin_token');
  }
}

loginBtn.addEventListener('click', async () => {
  hideFlash();
  loginError.classList.add('hidden');
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password: passwordInput.value }),
    });
    token = data.token;
    localStorage.setItem('admin_token', token);
    await showPanel();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.classList.remove('hidden');
  }
});

passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});

logoutBtn.addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  token = '';
  localStorage.removeItem('admin_token');
  panelView.classList.add('hidden');
  loginView.classList.remove('hidden');
});

connectGoogleBtn.addEventListener('click', async () => {
  try {
    const data = await api('/api/google/connect');
    window.location.href = data.url;
  } catch (err) {
    showFlash(err.message, 'err');
  }
});

discoverLocationsBtn.addEventListener('click', async () => {
  discoverLocationsBtn.disabled = true;
  locationPicker.classList.remove('hidden');
  locationPicker.innerHTML = '<p class="sub">Buscando estabelecimentos...</p>';
  try {
    const data = await api('/api/google/locations');
    if (!data.locations?.length) {
      locationPicker.innerHTML = '<p class="sub">Nenhum estabelecimento encontrado para esta conta.</p>';
      return;
    }
    locationPicker.innerHTML = data.locations.map((loc) => `
      <button type="button" class="location-option" data-name="${escapeAttr(loc.name)}">
        <strong>${escapeHtml(loc.title)}</strong>
        ${loc.address ? `<span>${escapeHtml(loc.address)}</span>` : ''}
      </button>
    `).join('');

    locationPicker.querySelectorAll('.location-option').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api('/api/google/location', {
            method: 'POST',
            body: JSON.stringify({ locationName: btn.dataset.name }),
          });
          locationPicker.querySelectorAll('.location-option').forEach((el) => {
            el.classList.remove('is-selected');
          });
          btn.classList.add('is-selected');
          showFlash('Perfil selecionado. Agora você pode sincronizar.', 'ok');
          await loadGoogleStatus();
        } catch (err) {
          showFlash(err.message, 'err');
        }
      });
    });
  } catch (err) {
    locationPicker.innerHTML = `<p class="message err">${escapeHtml(formatApiError(err.message))}</p>`;
  } finally {
    discoverLocationsBtn.disabled = false;
    loadGoogleStatus();
  }
});

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  try {
    const data = await api('/api/sync', { method: 'POST' });
    draft = data.draft;
    renderDraft();
    const s = data.summary;
    showFlash(
      `Sync concluído: ${s.added} novos, ${s.updated} atualizados, ${s.preserved} preservados (editados), ${s.removedFromGoogle} removidos no Google.`,
      'ok'
    );
  } catch (err) {
    showFlash(err.message, 'err');
  } finally {
    syncBtn.disabled = false;
    loadGoogleStatus();
  }
});

publishBtn.addEventListener('click', async () => {
  publishBtn.disabled = true;
  try {
    const data = await api('/api/publish', { method: 'POST' });
    showFlash(`Publicado! ${data.public.items.length} depoimentos visíveis no site.`, 'ok');
  } catch (err) {
    showFlash(err.message, 'err');
  } finally {
    publishBtn.disabled = false;
  }
});

addManualBtn.addEventListener('click', async () => {
  try {
    draft = await api('/api/draft/items', {
      method: 'POST',
      body: JSON.stringify({
        author: manualAuthor.value,
        text: manualText.value,
        rating: manualRating.value,
      }),
    });
    manualAuthor.value = '';
    manualText.value = '';
    renderDraft();
    showFlash('Depoimento manual adicionado.', 'ok');
  } catch (err) {
    showFlash(err.message, 'err');
  }
});

const params = new URLSearchParams(window.location.search);
if (params.get('google') === 'connected') {
  showFlash('Google conectado. Agora clique em «Descobrir perfil» para escolher o escritório.', 'ok');
  history.replaceState({}, '', '/admin/');
} else if (params.get('google') === 'error') {
  showFlash('Erro ao conectar Google Business. Verifique as credenciais.', 'err');
  history.replaceState({}, '', '/admin/');
}

tryAutoLogin();
