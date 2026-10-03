/* TipTap rich-text editor para o blog (ESM via esm.sh) */
import { Editor } from 'https://esm.sh/@tiptap/core@2.6.6';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2.6.6';
import Link from 'https://esm.sh/@tiptap/extension-link@2.6.6';
import Underline from 'https://esm.sh/@tiptap/extension-underline@2.6.6';
import { TextStyle } from 'https://esm.sh/@tiptap/extension-text-style@2.6.6';
import { Color } from 'https://esm.sh/@tiptap/extension-color@2.6.6';
import { Highlight } from 'https://esm.sh/@tiptap/extension-highlight@2.6.6';
import TextAlign from 'https://esm.sh/@tiptap/extension-text-align@2.6.6';
import Placeholder from 'https://esm.sh/@tiptap/extension-placeholder@2.6.6';

// Estende a TextStyle para incluir fontFamily e fontSize como atributos
const ExtendedTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      fontFamily: {
        default: null,
        parseHTML: (el) => el.style && el.style.fontFamily ? el.style.fontFamily.replace(/['"]/g, '') : null,
        renderHTML: (attrs) => attrs.fontFamily ? { style: `font-family:${attrs.fontFamily}` } : {},
      },
      fontSize: {
        default: null,
        parseHTML: (el) => el.style && el.style.fontSize ? el.style.fontSize : null,
        renderHTML: (attrs) => attrs.fontSize ? { style: `font-size:${attrs.fontSize}` } : {},
      },
    };
  },
});

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

  // Eventos do seletor de fonte: aplica via mark textStyle
  toolbarEl.querySelector('[data-action="font-family"]').addEventListener('change', (e) => {
    const family = e.target.value;
    activeFont = family;
    if (!editor) return;
    if (family) {
      editor.chain().focus().setMark('textStyle', { fontFamily: family }).run();
    } else {
      editor.chain().focus().updateMark('textStyle', { fontFamily: null }).run();
    }
  });
  toolbarEl.querySelector('[data-action="font-size"]').addEventListener('change', (e) => {
    const size = e.target.value;
    activeSize = size;
    if (!editor) return;
    if (size) {
      editor.chain().focus().setMark('textStyle', { fontSize: size + 'px' }).run();
    } else {
      editor.chain().focus().updateMark('textStyle', { fontSize: null }).run();
    }
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
  if (!toolbarEl || !contentEl) return false;

  config = await loadConfig();
  activeFont = config.fontDefault;
  activeSize = config.sizeDefault;
  activeTextColor = config.textColorDefault;
  activeBgColor = config.bgColorDefault;

  const initialHtml = contentEl.innerHTML.trim();

  const extensions = [
    StarterKit.configure({}),
    Underline,
    Link.configure({ openOnClick: false, autolink: true }),
    ExtendedTextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Placeholder.configure({ placeholder: 'Comece a escrever o post...' }),
  ];

  editor = new Editor({
    element: contentEl,
    extensions,
    content: initialHtml || '<p></p>',
    onUpdate: refreshToolbarState,
    onSelectionUpdate: refreshToolbarState,
    onTransaction: refreshToolbarState,
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