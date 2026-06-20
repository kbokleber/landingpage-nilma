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

// Lógica de Navegação por Abas do Painel Admin
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

navItems.forEach((item) => {
  item.addEventListener('click', () => {
    const targetTab = item.dataset.tab;
    
    // Atualiza estado ativo dos botões do menu
    navItems.forEach((nav) => nav.classList.remove('active'));
    item.classList.add('active');
    
    // Alterna a exibição das abas de conteúdo
    tabContents.forEach((content) => {
      if (content.id === `tab-content-${targetTab}`) {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    });
  });
});

tryAutoLogin();

// ============== BLOG ==============
const blogList = document.getElementById('blog-list');
const blogEditor = document.getElementById('blog-editor');
const blogEditorTitle = document.getElementById('blog-editor-title');
const blogTitle = document.getElementById('blog-title');
const blogAuthor = document.getElementById('blog-author');
const blogExcerpt = document.getElementById('blog-excerpt');
const blogContent = document.getElementById('blog-content');
const blogCover = document.getElementById('blog-cover');
const blogCoverInput = document.getElementById('blog-cover-input');
const blogCoverPreview = document.getElementById('blog-cover-preview');
const blogCoverRemove = document.getElementById('blog-cover-remove');
const blogTags = document.getElementById('blog-tags');
const blogStatus = document.getElementById('blog-status');
const blogStatusFilter = document.getElementById('blog-status-filter');
const blogDateFrom = document.getElementById('blog-date-from');
const blogDateTo = document.getElementById('blog-date-to');
const blogFilterClearBtn = document.getElementById('blog-filter-clear-btn');
const blogFilterInfo = document.getElementById('blog-filter-info');
const blogImagesDiv = document.getElementById('blog-images');
const blogImageInput = document.getElementById('blog-image-input');
const blogEditorStatus = document.getElementById('blog-editor-status');
const apiKeyName = document.getElementById('api-key-name');
const apiKeyNew = document.getElementById('api-key-new');
const apiKeyList = document.getElementById('api-key-list');

let blogCurrentId = null;
let blogCoverPendingFile = null;

function setBlogStatus(text) {
  blogEditorStatus.textContent = text || '';
}

function renderCoverPreview(url) {
  if (url) {
    blogCoverPreview.innerHTML = `<img src="${escapeAttr(url)}" alt="Capa do post">`;
    blogCoverRemove.hidden = false;
  } else {
    blogCoverPreview.innerHTML = '<span class="cover-empty">Nenhuma capa selecionada</span>';
    blogCoverRemove.hidden = true;
  }
  blogCover.value = url || '';
}

function renderPendingCover(file) {
  if (!file) return;
  const objectUrl = URL.createObjectURL(file);
  blogCoverPreview.innerHTML = `<img src="${escapeAttr(objectUrl)}" alt="Capa selecionada (prévia)">`;
  blogCoverRemove.hidden = false;
  blogCover.dataset.pendingName = file.name;
  blogCover.dataset.pendingSize = String(file.size);
}

function readBlogForm() {
  return {
    title: blogTitle.value.trim(),
    excerpt: blogExcerpt.value.trim(),
    contentHtml: blogContent.value,
    coverImage: blogCover.value.trim(),
    author: blogAuthor.value.trim() || 'Dra. Nilma Alves',
    tags: blogTags.value.split(',').map((t) => t.trim()).filter(Boolean),
    status: blogStatus.value || 'draft',
  };
}

function fillBlogForm(post) {
  blogTitle.value = post.title || '';
  blogAuthor.value = post.author || 'Dra. Nilma Alves';
  blogExcerpt.value = post.excerpt || '';
  blogContent.value = post.contentHtml || '';
  blogCoverPendingFile = null;
  renderCoverPreview(post.coverImage || '');
  blogTags.value = (post.tags || []).join(', ');
  blogStatus.value = post.status || 'draft';
  renderBlogImages(post.images || []);
}

function resetBlogForm() {
  blogCurrentId = null;
  blogEditorTitle.textContent = 'Novo post';
  fillBlogForm({ title: '', author: 'Dra. Nilma Alves', excerpt: '', contentHtml: '', coverImage: '', tags: [], images: [] });
  setBlogStatus('');
  blogCoverInput.value = '';
}

function renderBlogImages(images) {
  if (!images.length) {
    blogImagesDiv.innerHTML = '<p class="sub">Nenhuma imagem na galeria.</p>';
    return;
  }
  blogImagesDiv.innerHTML = images.map((img) => `
    <div class="image-thumb">
      <img src="${escapeAttr(img.url)}" alt="${escapeAttr(img.alt || '')}">
      <button type="button" data-image-id="${img.id}" aria-label="Remover">×</button>
    </div>
  `).join('');
  blogImagesDiv.querySelectorAll('button[data-image-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remover esta imagem?')) return;
      try {
        await api(`/api/admin/post-images/${btn.dataset.imageId}`, { method: 'DELETE' });
        await loadBlogEditor(blogCurrentId);
      } catch (err) {
        showFlash(err.message, 'err');
      }
    });
  });
}

async function loadBlogList() {
  try {
    const params = new URLSearchParams();
    if (blogStatusFilter.value) params.set('status', blogStatusFilter.value);
    if (blogDateFrom && blogDateFrom.value) params.set('dateFrom', blogDateFrom.value);
    if (blogDateTo && blogDateTo.value) params.set('dateTo', blogDateTo.value);
    const data = await api(`/api/admin/posts?${params.toString()}`);
    if (blogFilterInfo) {
      const filters = [];
      if (blogStatusFilter.value) filters.push(`status=${blogStatusFilter.value}`);
      if (blogDateFrom && blogDateFrom.value) filters.push(`de=${blogDateFrom.value}`);
      if (blogDateTo && blogDateTo.value) filters.push(`até=${blogDateTo.value}`);
      const filterTxt = filters.length ? ` (filtros: ${filters.join(', ')})` : '';
      blogFilterInfo.textContent = `${data.total} post${data.total === 1 ? '' : 's'} encontrado${data.total === 1 ? '' : 's'}${filterTxt}`;
    }
    if (!data.items.length) {
      blogList.innerHTML = '<p class="sub">Nenhum post encontrado com os filtros atuais.</p>';
      return;
    }
    blogList.innerHTML = data.items.map((p) => {
      const createdAt = p.createdAt ? new Date(p.createdAt).toLocaleDateString('pt-BR') : '—';
      return `
      <div class="blog-item">
        <div class="blog-item-info">
          <div class="blog-item-title">${escapeHtml(p.title || '(sem título)')}</div>
          <div class="blog-item-meta">
            <span class="blog-item-status ${escapeAttr(p.status)}">${escapeHtml(p.status)}</span>
            <span>Criado: ${createdAt}</span>
            ${p.publishedAt ? `<span>Publicado: ${new Date(p.publishedAt).toLocaleDateString('pt-BR')}</span>` : ''}
            <span>/${escapeHtml(p.slug)}</span>
            ${p.tags && p.tags.length ? `<span>${p.tags.map(escapeHtml).join(', ')}</span>` : ''}
          </div>
        </div>
        <div class="blog-item-actions">
          <button class="btn secondary" type="button" data-action="edit" data-id="${p.id}">Editar</button>
          ${p.status !== 'published' ? `<button class="btn" type="button" data-action="publish" data-id="${p.id}">Publicar</button>` : ''}
          <button class="btn outline danger" type="button" data-action="delete" data-id="${p.id}">Excluir</button>
        </div>
      </div>
    `;
    }).join('');
    blogList.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        if (btn.dataset.action === 'edit') loadBlogEditor(id);
        else if (btn.dataset.action === 'publish') publishBlogPost(id);
        else if (btn.dataset.action === 'delete') deleteBlogPost(id);
      });
    });
  } catch (err) {
    blogList.innerHTML = `<p class="message err">${escapeHtml(err.message)}</p>`;
  }
}

async function loadBlogEditor(id) {
  try {
    const post = await api(`/api/admin/posts/${id}`);
    blogCurrentId = id;
    blogEditorTitle.textContent = `Editar post #${id}`;
    fillBlogForm(post);
    blogEditor.classList.remove('hidden');
    setBlogStatus('Post carregado.');
  } catch (err) {
    showFlash(err.message, 'err');
  }
}

async function saveBlogPost({ publishNow = false } = {}) {
  const payload = readBlogForm();
  if (!payload.title || !payload.contentHtml) {
    setBlogStatus('Preencha título e conteúdo.');
    return;
  }
  const useMultipart = !!blogCoverPendingFile;
  try {
    let post;
    if (useMultipart) {
      const fd = new FormData();
      fd.append('title', payload.title);
      fd.append('excerpt', payload.excerpt || '');
      fd.append('contentHtml', payload.contentHtml || '');
      fd.append('author', payload.author || 'Dra. Nilma Alves');
      fd.append('tags', payload.tags.join(','));
      fd.append('status', payload.status || 'draft');
      fd.append('cover', blogCoverPendingFile, blogCoverPendingFile.name);
      const url = blogCurrentId ? `/api/admin/posts/${blogCurrentId}` : '/api/admin/posts';
      const method = blogCurrentId ? 'PUT' : 'POST';
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(url, { method, body: fd, credentials: 'include', headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar.');
      post = data;
    } else if (blogCurrentId) {
      post = await api(`/api/admin/posts/${blogCurrentId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      post = await api('/api/admin/posts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    if (!blogCurrentId) {
      blogCurrentId = post.id;
      blogEditorTitle.textContent = `Editar post #${post.id}`;
    }
    blogCoverPendingFile = null;
    if (publishNow && post.status !== 'published') {
      post = await api(`/api/admin/posts/${blogCurrentId}/publish`, { method: 'POST' });
    }
    if (post.status !== blogStatus.value) {
      blogStatus.value = post.status;
    }
    setBlogStatus(`Salvo às ${new Date().toLocaleTimeString('pt-BR')}.`);
    const finalStatus = blogStatus.value;
    const msg = finalStatus === 'published' ? 'Post publicado.' : (finalStatus === 'archived' ? 'Post arquivado.' : 'Rascunho salvo.');
    showFlash(msg, 'ok');
    loadBlogList();
  } catch (err) {
    setBlogStatus(err.message);
    showFlash(err.message, 'err');
  }
}

async function publishBlogPost(id) {
  if (!confirm('Publicar este post agora?')) return;
  try {
    await api(`/api/admin/posts/${id}/publish`, { method: 'POST' });
    showFlash('Post publicado.', 'ok');
    loadBlogList();
  } catch (err) {
    showFlash(err.message, 'err');
  }
}

async function deleteBlogPost(id) {
  if (!confirm('Excluir este post e suas imagens da galeria? Esta ação não pode ser desfeita.')) return;
  try {
    await api(`/api/admin/posts/${id}`, { method: 'DELETE' });
    showFlash('Post excluído.', 'ok');
    if (blogCurrentId === id) {
      blogEditor.classList.add('hidden');
      resetBlogForm();
    }
    loadBlogList();
  } catch (err) {
    showFlash(err.message, 'err');
  }
}

document.getElementById('blog-new-btn').addEventListener('click', () => {
  resetBlogForm();
  blogEditor.classList.remove('hidden');
  blogTitle.focus();
});
document.getElementById('blog-cancel-btn').addEventListener('click', () => {
  blogEditor.classList.add('hidden');
  resetBlogForm();
});
document.getElementById('blog-save-draft-btn').addEventListener('click', () => saveBlogPost({ publishNow: false }));
document.getElementById('blog-publish-btn').addEventListener('click', () => saveBlogPost({ publishNow: true }));
document.getElementById('blog-delete-btn').addEventListener('click', () => {
  if (blogCurrentId) deleteBlogPost(blogCurrentId);
});
blogStatusFilter.addEventListener('change', loadBlogList);
if (blogDateFrom) blogDateFrom.addEventListener('change', loadBlogList);
if (blogDateTo) blogDateTo.addEventListener('change', loadBlogList);
if (blogFilterClearBtn) {
  blogFilterClearBtn.addEventListener('click', () => {
    blogStatusFilter.value = '';
    if (blogDateFrom) blogDateFrom.value = '';
    if (blogDateTo) blogDateTo.value = '';
    loadBlogList();
  });
}

blogCoverInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  blogCoverPendingFile = file;
  renderPendingCover(file);
  setBlogStatus(`Capa "${file.name}" selecionada. Será enviada ao clicar em Salvar.`);
});

blogCoverRemove.addEventListener('click', async () => {
  blogCoverPendingFile = null;
  if (!blogCurrentId) {
    renderCoverPreview('');
    return;
  }
  if (!confirm('Remover a capa atual?')) return;
  try {
    const updated = await api(`/api/admin/posts/${blogCurrentId}`, {
      method: 'PUT',
      body: JSON.stringify({ coverImage: '' }),
    });
    renderCoverPreview(updated.coverImage || '');
    showFlash('Capa removida.', 'ok');
  } catch (err) {
    showFlash(err.message, 'err');
  }
});

blogImageInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!blogCurrentId) {
    showFlash('Salve o rascunho antes de enviar imagens.', 'err');
    blogImageInput.value = '';
    return;
  }
  const formData = new FormData();
  formData.append('image', file);
  try {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api/admin/posts/${blogCurrentId}/images`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro no upload');
    showFlash('Imagem adicionada.', 'ok');
    await loadBlogEditor(blogCurrentId);
  } catch (err) {
    showFlash(err.message, 'err');
  } finally {
    blogImageInput.value = '';
  }
});

// API Keys
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
    return ok;
  }
}

function buildKeyDisplay(key, scope = null) {
  const suf = scope ? `-${scope}` : '';
  return `
    <div class="api-key-reveal">
      <strong>Chave disponível.</strong> Copie com um clique — você pode revelá-la novamente depois, em "Ver / Copiar".
      <div class="api-key-secret">
        <input type="password" id="api-key-secret-input${suf}" value="${escapeAttr(key)}" readonly>
        <button class="btn outline" type="button" id="api-key-toggle-btn${suf}" title="Mostrar/ocultar">👁</button>
        <button class="btn" type="button" id="api-key-copy-btn${suf}">Copiar chave</button>
      </div>
      <small>Prefixo identificador: <code>${escapeHtml(key.slice(0, 12))}…</code></small>
    </div>
  `;
}

function bindKeyRevealHandlers(key, scope = null) {
  const suf = scope ? `-${scope}` : '';
  const input = document.getElementById(`api-key-secret-input${suf}`);
  const toggle = document.getElementById(`api-key-toggle-btn${suf}`);
  const copy = document.getElementById(`api-key-copy-btn${suf}`);
  if (!input || !toggle || !copy) return;
  toggle.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    toggle.textContent = input.type === 'password' ? '👁' : '🙈';
  });
  copy.addEventListener('click', async () => {
    const ok = await copyToClipboard(key);
    if (ok) {
      const original = copy.textContent;
      copy.textContent = '✓ Copiado!';
      copy.disabled = true;
      setTimeout(() => {
        copy.textContent = original;
        copy.disabled = false;
      }, 1800);
    } else {
      showFlash('Não foi possível copiar. Selecione manualmente (clique no campo → Ctrl+C).', 'err');
      input.type = 'text';
      input.focus();
      input.select();
    }
  });
}

async function loadApiKeys() {
  try {
    const data = await api('/api/admin/api-keys');
    if (!data.items.length) {
      apiKeyList.innerHTML = '<p class="sub">Nenhuma chave cadastrada.</p>';
      return;
    }
    apiKeyList.innerHTML = data.items.map((k) => `
      <div class="api-key-item" data-id="${k.id}">
        <div class="api-key-meta">
          <div class="api-key-name">${escapeHtml(k.name)}</div>
          <div class="api-key-info">
            <span class="api-key-prefix">${escapeHtml(k.prefix)}…</span>
            <span>Criada: ${new Date(k.createdAt).toLocaleString('pt-BR')}</span>
            <span>Último uso: ${k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('pt-BR') : '—'}</span>
          </div>
        </div>
        <div class="api-key-actions">
          <button class="btn secondary" type="button" data-action="reveal" data-id="${k.id}">Ver / Copiar</button>
          <button class="btn outline danger" type="button" data-action="delete" data-id="${k.id}">Excluir</button>
        </div>
        <div class="api-key-secret hidden" data-secret-for="${k.id}"></div>
      </div>
    `).join('');
    apiKeyList.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Excluir esta chave permanentemente? Sistemas externos usando-a deixarão de funcionar imediatamente.')) return;
        try {
          await api(`/api/admin/api-keys/${btn.dataset.id}`, { method: 'DELETE' });
          showFlash('Chave excluída.', 'ok');
          loadApiKeys();
        } catch (err) {
          showFlash(err.message, 'err');
        }
      });
    });
    apiKeyList.querySelectorAll('button[data-action="reveal"]').forEach((btn) => {
      btn.addEventListener('click', () => revealApiKeyInline(btn.dataset.id));
    });
  } catch (err) {
    apiKeyList.innerHTML = `<p class="message err">${escapeHtml(err.message)}</p>`;
  }
}

async function revealApiKeyInline(id) {
  const container = apiKeyList.querySelector(`[data-secret-for="${id}"]`);
  if (!container) return;
  const password = prompt('Confirme sua senha de administrador para revelar esta chave:');
  if (!password) return;
  try {
    const result = await api(`/api/admin/api-keys/${id}/reveal`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    container.innerHTML = buildKeyDisplay(result.key, `reveal-${id}`);
    container.classList.remove('hidden');
    bindKeyRevealHandlers(result.key, `reveal-${id}`);
    showFlash('Chave revelada. Copie-a com segurança.', 'ok');
  } catch (err) {
    showFlash(err.message, 'err');
  }
}

document.getElementById('api-key-create-btn').addEventListener('click', async () => {
  const name = apiKeyName.value.trim() || 'Default';
  try {
    const result = await api('/api/admin/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    apiKeyName.value = '';
    apiKeyNew.innerHTML = buildKeyDisplay(result.key, 'new');
    apiKeyNew.classList.remove('hidden');
    bindKeyRevealHandlers(result.key, 'new');
    showFlash('Chave gerada.', 'ok');
    loadApiKeys();
  } catch (err) {
    showFlash(err.message, 'err');
  }
});

document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    if (item.dataset.tab === 'blog') {
      loadBlogList();
    }
  });
});

// ============== SETTINGS ==============
const settingsForm = document.getElementById('settings-form');
const settingsStatus = document.getElementById('settings-status');

const SETTINGS_GROUPS = {
  site: { label: 'Site', icon: '⚙️', help: 'Configurações gerais do servidor e da aplicação.' },
  google: { label: 'Google', icon: '🔎', help: 'Credenciais da Google Business Profile API (avaliações do Google).' },
  instagram: { label: 'Instagram', icon: '📸', help: 'Credenciais do app Meta para sincronização do Instagram.' },
};

const SETTINGS_LABELS = {
  PORT: { group: 'site', label: 'Porta do Servidor', help: 'Requer reiniciar o servidor após salvar.', type: 'number' },
  ADMIN_PASSWORD: { group: 'site', label: 'Senha Administrativa', help: 'Texto puro. Valide após salvar.', type: 'password' },
  BLOG_UPLOAD_MAX_MB: { group: 'site', label: 'Tamanho máximo de upload (MB)', help: 'Padrão: 5 MB.', type: 'number' },
  GOOGLE_CLIENT_ID: { group: 'google', label: 'Google Client ID', help: 'OAuth 2.0 Client ID do Google Cloud.', type: 'text' },
  GOOGLE_CLIENT_SECRET: { group: 'google', label: 'Google Client Secret', help: 'OAuth 2.0 Client Secret.', type: 'password' },
  GOOGLE_REDIRECT_URI: { group: 'google', label: 'Google Redirect URI', help: 'URL de callback configurada no Google Cloud.', type: 'text' },
  INSTAGRAM_APP_ID: { group: 'instagram', label: 'Instagram App ID', help: 'App ID do seu app em developers.facebook.com. Não é sensível.', type: 'text' },
  INSTAGRAM_APP_SECRET: { group: 'instagram', label: 'Instagram App Secret', help: 'App Secret. Criptografado no banco. Use 👁 para revelar.', type: 'password' },
  INSTAGRAM_REDIRECT_URI: { group: 'instagram', label: 'Instagram Redirect URI', help: 'Deve coincidir com o configurado no app do Facebook. Padrão: http://127.0.0.1:3001/api/instagram/callback', type: 'text' },
  INSTAGRAM_PAGE_ID: { group: 'instagram', label: 'Instagram Page ID (vinculada)', help: 'Preenchido automaticamente após conectar. Não é sensível.', type: 'text' },
  INSTAGRAM_IG_USER_ID: { group: 'instagram', label: 'Instagram Business User ID', help: 'Preenchido automaticamente após conectar.', type: 'text' },
  INSTAGRAM_SYNC_INTERVAL_MIN: { group: 'instagram', label: 'Intervalo de sincronização (min)', help: 'Mínimo 5 minutos. Requer reiniciar o servidor para mudar.', type: 'number' },
  INSTAGRAM_AUTO_IMPORT: { group: 'instagram', label: 'Sincronização automática', help: '1 = ativa, 0 = apenas manual via botão "Sincronizar agora".', type: 'text' },
  INSTAGRAM_AUTH_MODE: { group: 'instagram', label: 'Método de login', help: 'instagram = login direto com @advnilmaalves (Business Login, mais simples). facebook = login via Facebook + Página vinculada.', type: 'text' },
};

let currentSettingsGroup = 'site';

let settingsDirty = false;

function setSettingsStatus(text, kind) {
  settingsStatus.textContent = text || '';
  settingsStatus.style.color = kind === 'err' ? '#c0392b' : (kind === 'ok' ? '#1e7e34' : '#666');
}

function renderSettingsForm(items) {
  // Filtra só o grupo ativo
  const filtered = items.filter((item) => {
    const meta = SETTINGS_LABELS[item.key];
    if (!meta) return true; // desconhecido: mostra em "site"
    return meta.group === currentSettingsGroup;
  });
  if (filtered.length === 0) {
    settingsForm.innerHTML = '<p class="sub" style="padding:16px 0">Nenhuma configuração neste grupo.</p>';
    return;
  }
  settingsForm.innerHTML = filtered.map((item) => {
    const meta = SETTINGS_LABELS[item.key] || { label: item.key };
    const type = meta.type || 'text';
    const isMasked = type === 'password' || !!item.sensitive;
    const storedValue = item.value || '';
    const safeValue = isMasked ? '' : escapeAttr(storedValue);
    const placeholder = isMasked
      ? (item.hasValue ? '(clique no 👁 para revelar)' : '(vazio)')
      : '';
    const inputHtml = isMasked
      ? `
        <div class="setting-secret">
          <input id="setting-${item.key}" name="${escapeAttr(item.key)}"
            type="password"
            value=""
            autocomplete="new-password"
            placeholder="${placeholder}"
            data-masked="1"
            data-stored-value="${escapeAttr(storedValue)}"
            data-original="">
          <button class="btn outline" type="button" data-action="toggle-mask" data-key="${escapeAttr(item.key)}" title="Mostrar/ocultar valor">👁</button>
        </div>
      `
      : `
        <input id="setting-${item.key}" name="${escapeAttr(item.key)}"
          type="${type === 'number' ? 'number' : 'text'}"
          value="${safeValue}"
          autocomplete="off"
          placeholder=""
          data-original="${safeValue}">
      `;
    return `
      <div class="setting-row">
        <label for="setting-${item.key}">
          <span class="setting-name">${escapeHtml(meta.label)}</span>
          <code class="setting-key">${escapeHtml(item.key)}</code>
          ${item.sensitive ? '<span class="setting-sensitive">sensível</span>' : ''}
        </label>
        ${inputHtml}
        ${meta.help ? `<small class="setting-help">${escapeHtml(meta.help)}</small>` : ''}
        <small class="setting-source">Origem: ${item.source} · Atualizado: ${item.updatedAt || '—'}</small>
      </div>
    `;
  }).join('');
  settingsForm.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', () => {
      settingsDirty = true;
      setSettingsStatus('Há alterações não salvas.', 'warn');
    });
  });
  settingsForm.querySelectorAll('button[data-action="toggle-mask"]').forEach((btn) => {
    btn.addEventListener('click', () => toggleSettingMask(btn.dataset.key));
  });
}

async function toggleSettingMask(key) {
  const input = settingsForm.querySelector(`input[name="${key}"]`);
  if (!input) return;
  const isPasswordType = input.type === 'password';

  if (!isPasswordType) {
    // Está visível → oculta
    input.type = 'password';
    input.value = '';
    return;
  }

  if (input.dataset.masked === '1' && input.value === '') {
    if (input.dataset.sensitive === '1') {
      // Sensível criptografado → precisa confirmar senha do admin via backend
      const password = prompt('Confirme sua senha de administrador para revelar este valor:');
      if (!password) return;
      try {
        const result = await api(`/api/admin/settings/${encodeURIComponent(key)}/reveal`, {
          method: 'POST',
          body: JSON.stringify({ password }),
        });
        input.value = result.value;
        input.dataset.storedValue = result.value;
        input.type = 'text';
      } catch (err) {
        showFlash(err.message, 'err');
      }
    } else {
      // Não sensível, valor já veio em getAll
      input.value = input.dataset.storedValue || '';
      input.type = 'text';
    }
  }
}

async function loadSettings() {
  try {
    const data = await api('/api/admin/settings');
    renderSettingsForm(data.items);
    settingsDirty = false;
    setSettingsStatus('Configurações carregadas.', 'ok');
  } catch (err) {
    setSettingsStatus(err.message, 'err');
  }
}

async function saveSettings() {
  const inputs = settingsForm.querySelectorAll('input');
  const updates = [];
  inputs.forEach((input) => {
    const key = input.name;
    if (input.dataset.masked === '1') {
      if (input.value !== '') updates.push({ key, value: input.value });
    } else if (input.value !== input.dataset.original) {
      updates.push({ key, value: input.value });
    }
  });
  if (!updates.length) {
    setSettingsStatus('Nenhuma alteração para salvar.', 'ok');
    return;
  }
  setSettingsStatus('Salvando...');
  try {
    const res = await api('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ updates }),
    });
    renderSettingsForm(res.items);
    settingsDirty = false;
    setSettingsStatus(`Salvo às ${new Date().toLocaleTimeString('pt-BR')}.`, 'ok');
    showFlash('Configurações salvas.', 'ok');
  } catch (err) {
    setSettingsStatus(err.message, 'err');
    showFlash(err.message, 'err');
  }
}

document.getElementById('settings-save-btn').addEventListener('click', saveSettings);
document.getElementById('settings-reload-btn').addEventListener('click', () => {
  if (settingsDirty && !confirm('Descartar alterações não salvas?')) return;
  loadSettings();
});

// Sub-abas dentro de Configurações
function switchSettingsGroup(group) {
  if (!SETTINGS_GROUPS[group]) return;
  if (settingsDirty && !confirm('Descartar alterações não salvas?')) return;
  currentSettingsGroup = group;
  document.querySelectorAll('.settings-sub-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.group === group);
  });
  // Esconde/mostra os cards auxiliares pelo data-group
  document.querySelectorAll('#tab-content-configuracoes .card[data-group]').forEach((card) => {
    card.classList.toggle('hidden', card.dataset.group !== group);
  });
  loadSettings();
}

// Ao abrir a aba Configurações, aplica o filtro de cards auxiliares para o grupo atual
document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    if (item.dataset.tab === 'configuracoes') {
      document.querySelectorAll('#tab-content-configuracoes .card[data-group]').forEach((card) => {
        card.classList.toggle('hidden', card.dataset.group !== currentSettingsGroup);
      });
    }
  });
});

document.querySelectorAll('.settings-sub-tab').forEach((btn) => {
  btn.addEventListener('click', () => switchSettingsGroup(btn.dataset.group));
});

document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    if (item.dataset.tab === 'configuracoes') {
      loadSettings();
      loadApiKeys();
      loadInstagramPanel();
    }
  });
});

// ============== INSTAGRAM ==============
const igStatus = document.getElementById('ig-status');
const igConnectBtn = document.getElementById('ig-connect-btn');
const igSyncBtn = document.getElementById('ig-sync-btn');
const igDisconnectBtn = document.getElementById('ig-disconnect-btn');
const igPosts = document.getElementById('ig-posts');
const igMessage = document.getElementById('ig-message');

function igShowMessage(text, kind = 'info') {
  igMessage.textContent = text;
  igMessage.className = `message ${kind}`;
  igMessage.classList.remove('hidden');
}

async function loadInstagramStatus() {
  try {
    const s = await api('/api/admin/instagram/status');
    renderInstagramStatus(s);
    return s;
  } catch (err) {
    igStatus.innerHTML = `<span class="err">${escapeHtml(err.message)}</span>`;
    igConnectBtn.disabled = true;
    igSyncBtn.disabled = true;
    return null;
  }
}

function renderInstagramStatus(s) {
  if (!s) return;
  const parts = [];
  parts.push(`App ID configurado: <strong>${s.configured ? 'Sim' : 'Não'}</strong>`);
  parts.push(`Conectado: <strong>${s.connected ? 'Sim' : 'Não'}</strong>`);
  if (s.pageId) parts.push(`Página: <code>${escapeHtml(String(s.pageId))}</code>`);
  if (s.igUserId) parts.push(`IG User: <code>${escapeHtml(String(s.igUserId))}</code>`);
  parts.push(`Auto-sync: <strong>${s.autoImport === '0' ? 'Desligado' : `A cada ${s.intervalMin} min`}</strong>`);
  if (s.lastSyncAt) {
    const r = s.lastResult || {};
    parts.push(`Última sync: ${new Date(s.lastSyncAt).toLocaleString('pt-BR')} — +${r.added || 0} novos, ~${r.updated || 0} atualizados`);
  } else {
    parts.push(`Última sync: <em>nunca</em>`);
  }
  igStatus.innerHTML = parts.map((p) => `<span>${p}</span>`).join('');
  igConnectBtn.disabled = s.configured ? false : true;
  igConnectBtn.textContent = s.connected ? 'Reconectar' : 'Conectar Instagram';
  igSyncBtn.disabled = !s.connected;
  igDisconnectBtn.hidden = !s.connected;
  igSyncBtn.textContent = s.connected ? 'Sincronizar agora' : 'Sincronizar agora';
}

async function loadInstagramPosts() {
  try {
    const data = await api('/api/admin/instagram/posts?limit=12');
    if (!data.items.length) {
      igPosts.innerHTML = '<p class="sub">Nenhum post sincronizado ainda. Clique em "Sincronizar agora" após conectar.</p>';
      return;
    }
    igPosts.innerHTML = data.items.map((it) => {
      const media = it.localPath || it.thumbnailUrl || it.mediaUrl || '';
      const ts = it.timestamp ? new Date(it.timestamp).toLocaleString('pt-BR') : '—';
      const hiddenBadge = it.hidden ? '<span class="badge" style="background:#fff3cd;color:#856404">oculto</span>' : '';
      return `
        <div class="ig-card" data-id="${it.id}">
          <a href="${escapeAttr(it.permalink)}" target="_blank" rel="noopener">
            ${media ? `<img src="${escapeAttr(media)}" alt="" loading="lazy">` : '<div class="ig-empty">sem mídia</div>'}
            <span class="ig-type">${escapeHtml(it.igMediaType || 'POST')}</span>
            ${hiddenBadge}
          </a>
          <div class="ig-meta">
            <span class="ig-caption">${escapeHtml((it.caption || '').slice(0, 80))}${(it.caption || '').length > 80 ? '…' : ''}</span>
            <span class="ig-ts">${ts}</span>
          </div>
          <div class="ig-actions">
            ${it.hidden
              ? `<button class="btn outline" data-action="show" data-id="${it.id}">Mostrar</button>`
              : `<button class="btn outline" data-action="hide" data-id="${it.id}">Ocultar</button>`}
            <button class="btn outline danger" data-action="delete" data-id="${it.id}">Excluir</button>
          </div>
        </div>
      `;
    }).join('');
    igPosts.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        if (action === 'hide') {
          await api(`/api/admin/instagram/posts/${id}/hide`, { method: 'POST' });
          igShowMessage('Post ocultado.', 'ok');
        } else if (action === 'show') {
          await api(`/api/admin/instagram/posts/${id}/show`, { method: 'POST' });
          igShowMessage('Post visível novamente.', 'ok');
        } else if (action === 'delete') {
          if (!confirm('Excluir este post do cache local? (não afeta o Instagram)')) return;
          await api(`/api/admin/instagram/posts/${id}`, { method: 'DELETE' });
          igShowMessage('Post removido do cache.', 'ok');
        }
        loadInstagramPanel();
      });
    });
  } catch (err) {
    igPosts.innerHTML = `<p class="message err">${escapeHtml(err.message)}</p>`;
  }
}

async function loadInstagramPanel() {
  await loadInstagramStatus();
  await loadInstagramPosts();
}

igConnectBtn.addEventListener('click', async () => {
  igShowMessage('Gerando URL de conexão...', 'info');
  try {
    const data = await api('/api/admin/instagram/connect');
    window.open(data.url, '_blank', 'noopener');
    igShowMessage('Autorize o app na nova aba. Após autorizar, você voltará para cá automaticamente.', 'ok');
  } catch (err) {
    igShowMessage(err.message, 'err');
  }
});

igSyncBtn.addEventListener('click', async () => {
  igSyncBtn.disabled = true;
  igShowMessage('Sincronizando...', 'info');
  try {
    const result = await api('/api/admin/instagram/sync', {
      method: 'POST',
      body: JSON.stringify({ limit: 20 }),
    });
    igShowMessage(`+${result.added} novos, ~${result.updated} atualizados, ${result.skipped} sem mudança.${result.errors?.length ? ` ${result.errors.length} erros.` : ''}`, 'ok');
    loadInstagramPanel();
  } catch (err) {
    igShowMessage(err.message, 'err');
  } finally {
    igSyncBtn.disabled = false;
  }
});

igDisconnectBtn.addEventListener('click', async () => {
  if (!confirm('Desconectar o Instagram? Posts já sincronizados continuam no banco, mas a sincronização automática para.')) return;
  try {
    await api('/api/admin/instagram/disconnect', { method: 'POST' });
    igShowMessage('Instagram desconectado.', 'ok');
    loadInstagramPanel();
  } catch (err) {
    igShowMessage(err.message, 'err');
  }
});

// Mensagens da URL (após callback)
const igParams = new URLSearchParams(window.location.search);
if (igParams.get('instagram') === 'connected') {
  showFlash('Instagram conectado com sucesso!', 'ok');
  history.replaceState({}, '', '/admin/');
} else if (igParams.get('instagram') === 'error') {
  showFlash(`Erro ao conectar Instagram: ${decodeURIComponent(igParams.get('msg') || '')}`, 'err');
  history.replaceState({}, '', '/admin/');
}
