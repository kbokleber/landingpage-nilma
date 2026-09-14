const loginView = document.getElementById('login-view');
const panelView = document.getElementById('panel-view');
const loginUsername = document.getElementById('login-username');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const flash = document.getElementById('flash');
const publishBtn = document.getElementById('publish-btn');
const reviewList = document.getElementById('review-list');
const itemCount = document.getElementById('item-count');
const manualAuthor = document.getElementById('manual-author');
const manualRating = document.getElementById('manual-rating');
const manualText = document.getElementById('manual-text');
const manualArea = document.getElementById('manual-area');
const manualSiteStatus = document.getElementById('manual-site-status');
const reviewEditor = document.getElementById('review-editor');
const reviewEditorTitle = document.getElementById('review-editor-title');
const reviewEditId = document.getElementById('review-edit-id');
const reviewStatusFilter = document.getElementById('review-status-filter');
const reviewFilterInfo = document.getElementById('review-filter-info');
const reviewEditorStatus = document.getElementById('review-editor-status');
const reviewDeleteBtn = document.getElementById('review-delete-btn');

let draft = null;
let reviewCurrentId = null;
let currentUser = null;
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

function siteStatusOf(item) {
  if (item.siteStatus === 'draft' || item.siteStatus === 'published') return item.siteStatus;
  return item.visible === false ? 'draft' : 'published';
}

function badgesForItem(item) {
  const badges = [];
  const siteStatus = siteStatusOf(item);
  badges.push(`<span class="blog-item-status ${siteStatus}">${siteStatus === 'published' ? 'publicado' : 'rascunho'}</span>`);
  if (item.source === 'manual' || item.source === 'api') badges.push('<span class="badge manual">Manual</span>');
  if (item.editedFields?.length) badges.push('<span class="badge edited">Editado</span>');
  return badges.join('');
}

function setReviewEditorStatus(text) {
  if (reviewEditorStatus) reviewEditorStatus.textContent = text || '';
}

function resetReviewForm() {
  reviewCurrentId = null;
  if (reviewEditId) reviewEditId.value = '';
  if (reviewEditorTitle) reviewEditorTitle.textContent = 'Novo depoimento';
  manualAuthor.value = '';
  manualText.value = '';
  manualRating.value = '5';
  if (manualArea) manualArea.value = '';
  if (manualSiteStatus) manualSiteStatus.value = 'draft';
  if (reviewDeleteBtn) reviewDeleteBtn.hidden = true;
  setReviewEditorStatus('');
}

function openReviewEditor(item) {
  if (!item) {
    resetReviewForm();
    reviewEditor.classList.remove('hidden');
    manualAuthor.focus();
    return;
  }
  reviewCurrentId = item.id;
  if (reviewEditId) reviewEditId.value = item.id;
  if (reviewEditorTitle) reviewEditorTitle.textContent = `Editar: ${item.author || 'depoimento'}`;
  manualAuthor.value = item.author || '';
  manualText.value = item.text || '';
  manualRating.value = String(item.rating || 5);
  if (manualArea) manualArea.value = item.area || '';
  if (manualSiteStatus) manualSiteStatus.value = siteStatusOf(item);
  if (reviewDeleteBtn) reviewDeleteBtn.hidden = false;
  reviewEditor.classList.remove('hidden');
  setReviewEditorStatus('Depoimento carregado.');
  reviewEditor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function readReviewForm() {
  return {
    author: manualAuthor.value.trim(),
    text: manualText.value.trim(),
    rating: Number(manualRating.value) || 5,
    area: manualArea ? manualArea.value.trim() : '',
    siteStatus: manualSiteStatus ? manualSiteStatus.value : 'draft',
  };
}

function renderDraft() {
  if (!draft) return;
  if (itemCount) itemCount.textContent = String(draft.items.length);

  const filter = reviewStatusFilter ? reviewStatusFilter.value : '';
  let items = [...(draft.items || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  if (filter === 'draft' || filter === 'published') {
    items = items.filter((i) => siteStatusOf(i) === filter);
  }

  if (reviewFilterInfo) {
    const filterTxt = filter ? ` (filtro: ${filter === 'draft' ? 'rascunhos' : 'publicados'})` : '';
    reviewFilterInfo.textContent = `${items.length} depoimento${items.length === 1 ? '' : 's'}${filterTxt}`;
  }

  if (!items.length) {
    reviewList.innerHTML = '<p class="sub">Nenhum depoimento encontrado. Clique em «Novo depoimento».</p>';
    return;
  }

  reviewList.innerHTML = items.map((item) => {
    const status = siteStatusOf(item);
    const preview = String(item.text || '').slice(0, 140);
    return `
    <div class="blog-item" data-id="${escapeAttr(item.id)}">
      <div class="blog-item-info">
        <div class="blog-item-title">${escapeHtml(item.author || '(sem nome)')}</div>
        <div class="blog-item-meta">
          ${badgesForItem(item)}
          <span class="stars">${stars(item.rating)}</span>
          ${item.area ? `<span>${escapeHtml(item.area)}</span>` : ''}
          ${item.publishedAt ? `<span>${escapeHtml(item.publishedAt)}</span>` : ''}
        </div>
        <p class="sub" style="margin:6px 0 0">${escapeHtml(preview)}${(item.text || '').length > 140 ? '…' : ''}</p>
      </div>
      <div class="blog-item-actions">
        <button class="btn secondary" type="button" data-action="edit" data-id="${escapeAttr(item.id)}">Editar</button>
        ${status !== 'published'
          ? `<button class="btn" type="button" data-action="publish" data-id="${escapeAttr(item.id)}">Publicar</button>`
          : `<button class="btn outline" type="button" data-action="unpublish" data-id="${escapeAttr(item.id)}">Voltar a rascunho</button>`}
        <button class="btn outline" type="button" data-action="up" data-id="${escapeAttr(item.id)}" aria-label="Subir">↑</button>
        <button class="btn outline" type="button" data-action="down" data-id="${escapeAttr(item.id)}" aria-label="Descer">↓</button>
        <button class="btn outline danger" type="button" data-action="delete" data-id="${escapeAttr(item.id)}">Excluir</button>
      </div>
    </div>`;
  }).join('');

  reviewList.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'edit') {
        const item = draft.items.find((i) => i.id === id);
        if (item) openReviewEditor(item);
      } else if (action === 'publish') publishReviewItem(id);
      else if (action === 'unpublish') unpublishReviewItem(id);
      else if (action === 'delete') deleteReviewItem(id);
      else if (action === 'up') moveItem(id, -1);
      else if (action === 'down') moveItem(id, 1);
    });
  });
}

async function saveReview({ publishNow = false } = {}) {
  const payload = readReviewForm();
  if (!payload.author || !payload.text) {
    setReviewEditorStatus('Preencha autor e texto.');
    return;
  }
  if (publishNow) payload.siteStatus = 'published';

  try {
    if (reviewCurrentId) {
      draft = await api(`/api/draft/items/${reviewCurrentId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (publishNow) {
        const data = await api(`/api/draft/items/${reviewCurrentId}/publish`, { method: 'POST' });
        draft = data.draft || draft;
      }
    } else {
      draft = await api('/api/draft/items', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const created = [...draft.items].sort((a, b) => (b.order || 0) - (a.order || 0))[0];
      if (created) {
        reviewCurrentId = created.id;
        if (reviewEditId) reviewEditId.value = created.id;
        if (reviewEditorTitle) reviewEditorTitle.textContent = `Editar: ${created.author}`;
        if (reviewDeleteBtn) reviewDeleteBtn.hidden = false;
        if (publishNow && siteStatusOf(created) !== 'published') {
          const data = await api(`/api/draft/items/${created.id}/publish`, { method: 'POST' });
          draft = data.draft || draft;
        }
      }
    }
    if (manualSiteStatus) manualSiteStatus.value = publishNow ? 'published' : payload.siteStatus;
    const msg = publishNow || payload.siteStatus === 'published' ? 'Depoimento publicado.' : 'Rascunho salvo.';
    setReviewEditorStatus(`Salvo às ${new Date().toLocaleTimeString('pt-BR')}.`);
    showFlash(msg, 'ok');
    renderDraft();
  } catch (err) {
    setReviewEditorStatus(err.message);
    showFlash(err.message, 'err');
  }
}

async function publishReviewItem(id) {
  if (!confirm('Publicar este depoimento no site agora?')) return;
  try {
    const data = await api(`/api/draft/items/${id}/publish`, { method: 'POST' });
    draft = data.draft || draft;
    showFlash('Depoimento publicado.', 'ok');
    renderDraft();
  } catch (err) {
    showFlash(err.message, 'err');
  }
}

async function unpublishReviewItem(id) {
  if (!confirm('Voltar este depoimento para rascunho? Ele sairá do site.')) return;
  try {
    const data = await api(`/api/draft/items/${id}/unpublish`, { method: 'POST' });
    draft = data.draft || draft;
    showFlash('Depoimento voltou para rascunho.', 'ok');
    renderDraft();
  } catch (err) {
    showFlash(err.message, 'err');
  }
}

async function deleteReviewItem(id) {
  if (!confirm('Excluir este depoimento?')) return;
  try {
    draft = await api(`/api/draft/items/${id}`, { method: 'DELETE' });
    if (reviewCurrentId === id) {
      reviewEditor.classList.add('hidden');
      resetReviewForm();
    }
    showFlash('Depoimento excluído.', 'ok');
    renderDraft();
  } catch (err) {
    showFlash(err.message, 'err');
  }
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

function showPanel() {
  loginView.classList.add('hidden');
  panelView.classList.remove('hidden');
  const welcome = document.querySelector('.welcome-text');
  if (welcome && currentUser) {
    welcome.textContent = `Olá, ${currentUser.name || currentUser.username}`;
  }
  return api('/api/draft').then((data) => {
    draft = data;
    renderDraft();
  });
}

async function tryAutoLogin() {
  try {
    const me = await api('/api/auth/me');
    if (me.authenticated) {
      currentUser = me.user || null;
      await showPanel();
      return;
    }
  } catch {
    token = '';
    currentUser = null;
    localStorage.removeItem('admin_token');
  }
}

loginBtn.addEventListener('click', async () => {
  hideFlash();
  loginError.classList.add('hidden');
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: (loginUsername && loginUsername.value.trim()) || 'admin',
        password: passwordInput.value,
      }),
    });
    token = data.token;
    currentUser = data.user || null;
    localStorage.setItem('admin_token', token);
    passwordInput.value = '';
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

publishBtn.addEventListener('click', async () => {
  publishBtn.disabled = true;
  try {
    const data = await api('/api/publish', { method: 'POST' });
    showFlash(`Lista republicada! ${data.public.items.length} depoimento(s) publicado(s) no site.`, 'ok');
  } catch (err) {
    showFlash(err.message, 'err');
  } finally {
    publishBtn.disabled = false;
  }
});

document.getElementById('review-new-btn')?.addEventListener('click', () => openReviewEditor(null));
document.getElementById('review-save-draft-btn')?.addEventListener('click', () => {
  if (manualSiteStatus) manualSiteStatus.value = 'draft';
  saveReview({ publishNow: false });
});
document.getElementById('review-publish-btn')?.addEventListener('click', () => saveReview({ publishNow: true }));
document.getElementById('review-cancel-btn')?.addEventListener('click', () => {
  reviewEditor.classList.add('hidden');
  resetReviewForm();
});
reviewDeleteBtn?.addEventListener('click', () => {
  if (reviewCurrentId) deleteReviewItem(reviewCurrentId);
});
reviewStatusFilter?.addEventListener('change', renderDraft);

// Lógica de Navegação por Abas do Painel Admin
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

navItems.forEach((item) => {
  item.addEventListener('click', () => {
    const targetTab = item.dataset.tab;

    navItems.forEach((nav) => nav.classList.remove('active'));
    item.classList.add('active');

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
const blogToolbar = document.getElementById('blog-toolbar');
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
  const contentHtml = window.BlogEditor ? window.BlogEditor.getHtml() : (blogContent.value || blogContent.innerHTML || '');
  return {
    title: blogTitle.value.trim(),
    excerpt: blogExcerpt.value.trim(),
    contentHtml,
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
  if (window.BlogEditor) {
    window.BlogEditor.setHtml(post.contentHtml || '<p></p>');
  } else {
    blogContent.value = post.contentHtml || '';
  }
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
  item.addEventListener('click', async () => {
    if (item.dataset.tab === 'blog') {
      loadBlogList();
      if (window.BlogEditor && !window.BlogEditor._initialized) {
        window.BlogEditor.init().then((ok) => { window.BlogEditor._initialized = ok; });
      }
    }
    if (item.dataset.tab === 'depoimentos') {
      try {
        draft = await api('/api/draft');
        renderDraft();
      } catch (err) {
        showFlash(err.message, 'err');
      }
    }
  });
});

// Inicializa o BlogEditor quando o modulo terminar de carregar (mesmo se a aba Blog ja for a ativa)
if (window.BlogEditor) {
  Promise.resolve().then(() => {
    if (!window.BlogEditor._initialized) {
      window.BlogEditor.init().then((ok) => { window.BlogEditor._initialized = ok; });
    }
  });
}

// ============== SETTINGS ==============
const settingsForm = document.getElementById('settings-form');
const settingsStatus = document.getElementById('settings-status');

const SETTINGS_GROUPS = {
  site: { label: 'Site', icon: '⚙️', help: 'Configurações gerais do servidor e da aplicação.' },
};

const SETTINGS_LABELS = {
  PORT: { group: 'site', label: 'Porta do Servidor', help: 'Requer reiniciar o servidor após salvar.', type: 'number' },
  BLOG_UPLOAD_MAX_MB: { group: 'site', label: 'Tamanho máximo de upload (MB)', help: 'Padrão: 5 MB.', type: 'number' },
  EDITOR_FONTS: { group: 'site', label: 'Editor — Fontes disponíveis', help: 'Uma por linha. Define o que aparece no seletor de fonte.', type: 'list' },
  EDITOR_FONT_DEFAULT: { group: 'site', label: 'Editor — Fonte padrão', help: 'Tem que estar na lista acima.', type: 'text' },
  EDITOR_FONT_SIZES: { group: 'site', label: 'Editor — Tamanhos disponíveis (px)', help: 'Um por linha.', type: 'list' },
  EDITOR_FONT_SIZE_DEFAULT: { group: 'site', label: 'Editor — Tamanho padrão (px)', help: 'Tem que estar na lista acima.', type: 'number' },
  EDITOR_TEXT_COLORS: { group: 'site', label: 'Editor — Cores de texto', help: 'Hex (#rrggbb), uma por linha.', type: 'list' },
  EDITOR_BG_COLORS: { group: 'site', label: 'Editor — Cores de fundo', help: 'Hex (#rrggbb) ou "transparent", uma por linha.', type: 'list' },
  EDITOR_TEXT_COLOR_DEFAULT: { group: 'site', label: 'Editor — Cor de texto padrão', help: 'Hex (#rrggbb). Tem que estar na lista de cores.', type: 'text' },
  EDITOR_BG_COLOR_DEFAULT: { group: 'site', label: 'Editor — Cor de fundo padrão', help: 'Hex (#rrggbb) ou "transparent".', type: 'text' },
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
      : type === 'list'
      ? (() => {
          // Listas sao JSON no banco, mas no form aparecem como texto linha-a-linha
          let pretty = storedValue;
          try {
            const arr = JSON.parse(storedValue);
            if (Array.isArray(arr)) pretty = arr.join('\n');
          } catch {}
          return `
            <textarea id="setting-${item.key}" name="${escapeAttr(item.key)}"
              class="setting-list"
              rows="6"
              autocomplete="off"
              data-original="${escapeAttr(storedValue)}"
              placeholder="Um item por linha">${escapeHtml(pretty)}</textarea>
          `;
        })()
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
  settingsForm.querySelectorAll('input, textarea').forEach((el) => {
    el.addEventListener('input', () => {
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
  const inputs = settingsForm.querySelectorAll('input, textarea');
  const updates = [];
  inputs.forEach((input) => {
    const key = input.name;
    if (input.dataset.masked === '1') {
      if (input.value !== '') updates.push({ key, value: input.value });
      return;
    }
    let newValue;
    if (input.tagName === 'TEXTAREA' && input.classList.contains('setting-list')) {
      newValue = JSON.stringify(
        input.value
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      );
    } else {
      newValue = input.value;
    }
    if (newValue !== input.dataset.original) {
      updates.push({ key, value: newValue });
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
    }
    if (item.dataset.tab === 'usuarios') {
      loadUsersPanel();
    }
  });
});

// ============== USUÁRIOS ==============
const usersList = document.getElementById('users-list');

async function loadUsersPanel() {
  if (!usersList) return;
  try {
    const data = await api('/api/admin/users');
    if (!data.items?.length) {
      usersList.innerHTML = '<p class="sub">Nenhum usuário cadastrado.</p>';
      return;
    }
    usersList.innerHTML = data.items.map((u) => `
      <div class="blog-item" data-user-id="${u.id}">
        <div class="blog-item-info">
          <div class="blog-item-title">${escapeHtml(u.name || u.username)} <span class="sub">@${escapeHtml(u.username)}</span></div>
          <div class="blog-item-meta">
            <span class="blog-item-status ${u.active ? 'published' : 'draft'}">${u.active ? 'ativo' : 'inativo'}</span>
            <span>${escapeHtml(u.role)}</span>
            ${u.lastLoginAt ? `<span>Último login: ${new Date(u.lastLoginAt).toLocaleString('pt-BR')}</span>` : '<span>Nunca logou</span>'}
          </div>
        </div>
        <div class="blog-item-actions">
          <button class="btn outline" type="button" data-action="reset-pass" data-id="${u.id}">Redefinir senha</button>
          ${u.id !== currentUser?.id ? `<button class="btn outline" type="button" data-action="toggle" data-id="${u.id}" data-active="${u.active ? '1' : '0'}">${u.active ? 'Desativar' : 'Ativar'}</button>` : ''}
          ${u.id !== currentUser?.id ? `<button class="btn outline danger" type="button" data-action="delete" data-id="${u.id}">Excluir</button>` : ''}
        </div>
      </div>
    `).join('');

    usersList.querySelectorAll('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        const action = btn.dataset.action;
        try {
          if (action === 'reset-pass') {
            const newPassword = prompt('Nova senha (mín. 8 caracteres):');
            if (!newPassword) return;
            await api(`/api/admin/users/${id}/password`, {
              method: 'POST',
              body: JSON.stringify({ newPassword }),
            });
            showFlash('Senha redefinida.', 'ok');
          } else if (action === 'toggle') {
            const next = btn.dataset.active !== '1';
            await api(`/api/admin/users/${id}`, {
              method: 'PATCH',
              body: JSON.stringify({ active: next }),
            });
            showFlash(next ? 'Usuário ativado.' : 'Usuário desativado.', 'ok');
            loadUsersPanel();
          } else if (action === 'delete') {
            if (!confirm('Excluir este usuário?')) return;
            await api(`/api/admin/users/${id}`, { method: 'DELETE' });
            showFlash('Usuário excluído.', 'ok');
            loadUsersPanel();
          }
        } catch (err) {
          showFlash(err.message, 'err');
        }
      });
    });
  } catch (err) {
    usersList.innerHTML = `<p class="message err">${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById('user-change-password-btn')?.addEventListener('click', async () => {
  const status = document.getElementById('user-password-status');
  const currentPassword = document.getElementById('user-current-password')?.value || '';
  const newPassword = document.getElementById('user-new-password')?.value || '';
  try {
    await api('/api/admin/users/me/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (status) status.textContent = 'Senha alterada. Faça login novamente.';
    showFlash('Senha alterada. Entre novamente.', 'ok');
    token = '';
    currentUser = null;
    localStorage.removeItem('admin_token');
    panelView.classList.add('hidden');
    loginView.classList.remove('hidden');
  } catch (err) {
    if (status) status.textContent = err.message;
    showFlash(err.message, 'err');
  }
});

document.getElementById('user-create-btn')?.addEventListener('click', async () => {
  try {
    await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('user-new-username')?.value,
        name: document.getElementById('user-new-name')?.value,
        password: document.getElementById('user-create-password')?.value,
        role: document.getElementById('user-new-role')?.value || 'admin',
      }),
    });
    showFlash('Usuário criado.', 'ok');
    document.getElementById('user-new-username').value = '';
    document.getElementById('user-new-name').value = '';
    document.getElementById('user-create-password').value = '';
    loadUsersPanel();
  } catch (err) {
    showFlash(err.message, 'err');
  }
});

