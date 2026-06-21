/* TipTap rich-text editor para o blog */
(function () {
  'use strict';

  const Tiptap = window.tiptap || {};
  const Core = Tiptap.core;
  const StarterKit = Tiptap.starterKit;
  const Link = Tiptap.link;
  const Underline = Tiptap.underline;
  const TextStyle = Tiptap.textStyle;
  const Color = Tiptap.color;
  const Highlight = Tiptap.highlight;
  const TextAlign = Tiptap.textAlign;
  const Placeholder = Tiptap.placeholder;

  // Extension custom: FontFamily (aplica style="font-family: ...")
  const FontFamilyExt = Core && Core.Node.create ? Core.Node.create({
    name: 'fontFamily',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() {
      return { family: { default: null } };
    },
    parseHTML() { return [{ tag: 'span[style*="font-family"]' }]; },
    renderHTML({ HTMLAttributes }) {
      const family = HTMLAttributes.family || (HTMLAttributes.style || '').match(/font-family:\s*([^;"]+)/i)?.[1];
      return ['span', { style: family ? `font-family:${family}` : '' }, 0];
    },
  }) : null;

  // Extension custom: FontSize (aplica style="font-size: ...")
  const FontSizeExt = Core && Core.Mark ? Core.Mark.create({
    name: 'fontSize',
    addAttributes() {
      return { size: { default: null } };
    },
    parseHTML() { return [{ tag: 'span[style*="font-size"]' }]; },
    renderHTML({ HTMLAttributes }) {
      const size = HTMLAttributes.size;
      return ['span', { style: size ? `font-size:${size}px` : '' }, 0];
    },
  }) : null;

  let editor = null;
  let toolbarEl = null;
  let contentEl = null;
  let config = null;
  let activeFont = null;
  let activeSize = null;
  let activeTextColor = null;
  let activeBgColor = null;

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function defaultConfig() {
    return {
      fonts: ['Poppins', 'Arial', 'Georgia', 'Times New Roman'],
      fontDefault: 'Poppins',
      sizes: ['12', '14', '16', '18', '20', '24', '28', '32'],
      sizeDefault: '16',
      textColors: ['#333333', '#000000', '#7f4258', '#b3261e', '#1d6f42', '#1d4ed8'],
      bgColors: ['transparent', '#fff8e1', '#fde2e4', '#e0f2fe', '#dcfce7', '#fef3c7'],
      textColorDefault: '#333333',
      bgColorDefault: 'transparent',
    };
  }

  async function loadConfig() {
    try {
      const res = await fetch('/api/public/editor/config');
      if (!res.ok) return defaultConfig();
      const data = await res.json();
      return Object.assign(defaultConfig(), data || {});
    } catch (err) {
      return defaultConfig();
    }
  }

  function buildToolbar() {
    const optsFont = (config.fonts || []).map((f) => `<option value="${escapeHtml(f)}"${f === activeFont ? ' selected' : ''}>${escapeHtml(f)}</option>`).join('');
    const optsSize = (config.sizes || []).map((s) => `<option value="${s}"${s === activeSize ? ' selected' : ''}>${s}px</option>`).join('');
    const textSwatches = (config.textColors || []).map((c) =>
      `<button type="button" class="tt-swatch${c === activeTextColor ? ' active' : ''}" data-action="text-color" data-color="${escapeHtml(c)}" title="${escapeHtml(c)}" style="background:${escapeHtml(c)}"></button>`
    ).join('');
    const bgSwatches = (config.bgColors || []).map((c) => {
      const bg = c === 'transparent' ? 'transparent' : c;
      const styleBg = c === 'transparent' ? 'background-image:linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%);background-size:8px 8px;background-position:0 0,0 4px,4px -4px,-4px 0;' : `background:${c}`;
      return `<button type="button" class="tt-swatch tt-swatch-bg${c === activeBgColor ? ' active' : ''}" data-action="bg-color" data-color="${escapeHtml(c)}" title="${escapeHtml(c)}" style="${styleBg}"></button>`;
    }).join('');

    toolbarEl.innerHTML = `
      <div class="tt-group">
        <select class="tt-select" data-action="font-family" title="Fonte">${optsFont}</select>
        <select class="tt-select" data-action="font-size" title="Tamanho">${optsSize}</select>
      </div>
      <div class="tt-group">
        <button type="button" class="tt-btn" data-action="bold" title="Negrito (Ctrl+B)"><b>B</b></button>
        <button type="button" class="tt-btn" data-action="italic" title="Itálico (Ctrl+I)"><i>I</i></button>
        <button type="button" class="tt-btn" data-action="underline" title="Sublinhado"><u>U</u></button>
        <button type="button" class="tt-btn" data-action="strike" title="Tachado"><s>S</s></button>
      </div>
      <div class="tt-group">
        <button type="button" class="tt-btn" data-action="h2" title="Título">H2</button>
        <button type="button" class="tt-btn" data-action="h3" title="Subtítulo">H3</button>
        <button type="button" class="tt-btn" data-action="paragraph" title="Parágrafo">P</button>
        <button type="button" class="tt-btn" data-action="bulletList" title="Lista">•</button>
        <button type="button" class="tt-btn" data-action="orderedList" title="Lista numerada">1.</button>
        <button type="button" class="tt-btn" data-action="blockquote" title="Citação">❝</button>
      </div>
      <div class="tt-group">
        <button type="button" class="tt-btn" data-action="link" title="Inserir link">🔗</button>
        <button type="button" class="tt-btn" data-action="unlink" title="Remover link">⛓</button>
      </div>
      <div class="tt-group">
        <button type="button" class="tt-btn" data-action="align-left" title="Esquerda">⬅</button>
        <button type="button" class="tt-btn" data-action="align-center" title="Centro">⬌</button>
        <button type="button" class="tt-btn" data-action="align-right" title="Direita">➡</button>
      </div>
      <div class="tt-group tt-swatches">
        <span class="tt-swatches-label">T:</span>
        ${textSwatches}
      </div>
      <div class="tt-group tt-swatches">
        <span class="tt-swatches-label">F:</span>
        ${bgSwatches}
      </div>
      <div class="tt-group">
        <button type="button" class="tt-btn" data-action="undo" title="Desfazer">↶</button>
        <button type="button" class="tt-btn" data-action="redo" title="Refazer">↷</button>
        <button type="button" class="tt-btn" data-action="clear-format" title="Limpar formatação">⌫</button>
      </div>
    `;

    toolbarEl.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        handleAction(btn.dataset.action, btn.dataset.color);
      });
    });
  }

  function isActive(name, attrs) {
    if (!editor) return false;
    try { return editor.isActive(name, attrs); } catch { return false; }
  }

  function refreshToolbarState() {
    if (!toolbarEl) return;
    const states = [
      ['bold', isActive('bold')],
      ['italic', isActive('italic')],
      ['underline', isActive('underline')],
      ['strike', isActive('strike')],
      ['h2', isActive('heading', { level: 2 })],
      ['h3', isActive('heading', { level: 3 })],
      ['paragraph', isActive('paragraph')],
      ['bulletList', isActive('bulletList')],
      ['orderedList', isActive('orderedList')],
      ['blockquote', isActive('blockquote')],
      ['link', isActive('link')],
      ['align-left', isActive({ textAlign: 'left' })],
      ['align-center', isActive({ textAlign: 'center' })],
      ['align-right', isActive({ textAlign: 'right' })],
    ];
    states.forEach(([action, active]) => {
      const btn = toolbarEl.querySelector(`[data-action="${action}"]`);
      if (btn) btn.classList.toggle('active', active);
    });
  }

  function handleAction(action, color) {
    if (!editor) return;
    const chain = editor.chain().focus();
    switch (action) {
      case 'bold': chain.toggleBold().run(); break;
      case 'italic': chain.toggleItalic().run(); break;
      case 'underline': chain.toggleUnderline().run(); break;
      case 'strike': chain.toggleStrike().run(); break;
      case 'h2': chain.toggleHeading({ level: 2 }).run(); break;
      case 'h3': chain.toggleHeading({ level: 3 }).run(); break;
      case 'paragraph': chain.setParagraph().run(); break;
      case 'bulletList': chain.toggleBulletList().run(); break;
      case 'orderedList': chain.toggleOrderedList().run(); break;
      case 'blockquote': chain.toggleBlockquote().run(); break;
      case 'link': {
        const prev = editor.getAttributes('link').href;
        const url = window.prompt('URL do link (deixe vazio para remover):', prev || 'https://');
        if (url === null) return;
        if (url === '') chain.unsetLink().run();
        else chain.extendMarkRange('link').setLink({ href: url }).run();
        break;
      }
      case 'unlink': chain.unsetLink().run(); break;
      case 'align-left': chain.setTextAlign('left').run(); break;
      case 'align-center': chain.setTextAlign('center').run(); break;
      case 'align-right': chain.setTextAlign('right').run(); break;
      case 'text-color':
        if (color) chain.setColor(color).run();
        break;
      case 'bg-color':
        if (color) chain.setHighlight({ color: color }).run();
        break;
      case 'undo': chain.undo().run(); break;
      case 'redo': chain.redo().run(); break;
      case 'clear-format': chain.unsetAllMarks().clearNodes().run(); break;
    }
  }

  async function init() {
    toolbarEl = document.getElementById('blog-toolbar');
    contentEl = document.getElementById('blog-content');
    if (!toolbarEl || !contentEl || !Core || !StarterKit) return false;

    config = await loadConfig();
    activeFont = config.fontDefault;
    activeSize = config.sizeDefault;
    activeTextColor = config.textColorDefault;
    activeBgColor = config.bgColorDefault;

    const initialHtml = contentEl.innerHTML.trim();

    const extensions = [StarterKit.configure({})];
    if (Underline) extensions.push(Underline);
    if (Link) extensions.push(Link.configure({ openOnClick: false, autolink: true }));
    if (TextStyle) extensions.push(TextStyle);
    if (Color) extensions.push(Color);
    if (Highlight) extensions.push(Highlight.configure({ multicolor: true }));
    if (TextAlign) extensions.push(TextAlign.configure({ types: ['heading', 'paragraph'] }));
    if (Placeholder) extensions.push(Placeholder.configure({ placeholder: 'Comece a escrever o post...' }));

    editor = new Core.Editor({
      element: contentEl,
      extensions,
      content: initialHtml || '<p></p>',
      onUpdate: refreshToolbarState,
      onSelectionUpdate: refreshToolbarState,
      onTransaction: refreshToolbarState,
    });

    // Eventos do seletor de fonte
    toolbarEl.querySelector('[data-action="font-family"]').addEventListener('change', (e) => {
      const family = e.target.value;
      activeFont = family;
      editor.chain().focus().setMark('textStyle', { fontFamily: family }).run();
    });
    // Eventos do seletor de tamanho
    toolbarEl.querySelector('[data-action="font-size"]').addEventListener('change', (e) => {
      const size = e.target.value;
      activeSize = size;
      editor.chain().focus().setMark('textStyle', { fontSize: size + 'px' }).run();
    });

    buildToolbar();
    refreshToolbarState();
    return true;
  }

  function getHtml() {
    if (!editor) return '';
    return editor.getHTML();
  }

  function setHtml(html) {
    if (!editor) {
      if (contentEl) contentEl.innerHTML = html || '<p></p>';
      return;
    }
    editor.commands.setContent(html || '<p></p>', false);
  }

  function destroy() {
    if (editor) { editor.destroy(); editor = null; }
  }

  window.BlogEditor = { init, getHtml, setHtml, destroy };
})();