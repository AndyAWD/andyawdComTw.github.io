/**
 * View — 把 ViewModel 的 view state 渲染成 DOM，並把使用者操作轉成 command。
 * 不做任何商業邏輯。
 */

/** 拖拉面板時，中間程式碼區至少要留下的寬度 */
const MIN_PANE = 280;

/** 四個預設 accent 在亮色模式下的深色對應（白底對比 ≥ 5:1） */
const ACCENT_ON_LIGHT = {
  '#3ddc84': '#12703b',
  '#56a8f5': '#175f9f',
  '#c77dbb': '#7d4074',
  '#b3ae60': '#6d6832'
};

export class IdeView {
  /**
   * @param {HTMLElement} root
   * @param {import('./viewmodel.js').IdeViewModel} vm
   */
  constructor(root, vm) {
    this.root = root;
    this.vm = vm;
    this.vm.addEventListener('change', () => this.render());

    window.addEventListener('hashchange', () => this.vm.syncFromHash());
    document.addEventListener('keydown', (e) => this.#onGlobalKey(e));
  }

  render() {
    const s = this.vm.getViewState();
    const scroll = this.#captureScroll();
    const focusKey = document.activeElement?.dataset?.focusKey || null;

    this.#applyChrome(s);

    this.root.textContent = '';
    this.root.append(
      ...[
        el('a', { class: 'skip-link', href: '#code-region' }, s.a11y.skipToCode),
        this.#topBar(s),
        this.#main(s),
        s.buildOpen ? this.#build(s) : null,
        this.#statusBar(s),
        el('div', { class: 'scrim', 'aria-hidden': 'true', onclick: () => this.vm.toggleDrawer(false) })
      ].filter((c) => c !== null && c !== undefined && c !== false)
    );
    this.root.className = 'ide' + (s.drawerOpen ? ' ide--drawer-open' : '');

    this.#restoreScroll(scroll);
    if (focusKey) {
      const next = this.root.querySelector(`[data-focus-key="${cssEscape(focusKey)}"]`);
      if (next) next.focus();
    }

    const hash = this.vm.hash;
    if (hash !== location.hash) history.replaceState(null, '', hash || location.pathname + location.search);
  }

  /* --- <html> / <head> 層級的東西 ---------------------------------------- */

  #applyChrome(s) {
    const html = document.documentElement;
    html.lang = s.lang;
    html.dataset.theme = s.theme;

    const accent = s.theme === 'light' ? darkenForLight(s.accent) : s.accent;
    html.style.setProperty('--accent', accent);
    html.style.setProperty('--accent-hover', lighten(accent, s.theme === 'light' ? -12 : 18));
    html.style.setProperty('--font-size', `${s.fontSize}px`);
    html.style.setProperty('--sidebar-width', `${s.sidebarWidth}px`);
    html.style.setProperty('--preview-width', `${s.previewWidth}px`);

    document.title = s.meta.title;
    setMeta('name', 'description', s.meta.description);
    setMeta('property', 'og:title', s.meta.title);
    setMeta('property', 'og:description', s.meta.description);
    setMeta('name', 'theme-color', s.theme === 'light' ? '#f7f8fa' : '#2b2d30');
  }

  /* --- 頂部工具列 -------------------------------------------------------- */

  #topBar(s) {
    return el('header', { class: 'topbar' },
      el('button', {
        class: 'icon-btn hamburger',
        type: 'button',
        'aria-label': s.a11y.toggleSidebar,
        'aria-expanded': String(s.drawerOpen),
        'data-focus-key': 'hamburger',
        onclick: () => this.vm.toggleDrawer()
      }, '☰'),
      el('div', { class: 'topbar__logo', 'aria-hidden': 'true' }),
      el('nav', { class: 'topbar__menus', 'aria-hidden': 'true' },
        ...s.menus.map((m) => el('span', { class: 'topbar__menu' }, m))),
      el('div', { class: 'topbar__spacer' }),
      el('div', { class: 'topbar__right' },
        el('span', { class: 'topbar__user' }, s.topBar.user || ''),
        el('span', { class: 'topbar__meta' }, `⑂ ${s.statusBar.branch || 'main'}`),
        el('span', { class: 'topbar__meta topbar__meta--device' }, s.topBar.device || ''),
        el('span', { class: 'topbar__run', 'aria-hidden': 'true' }, '▶'),
        this.#langSelect(s),
        s.allowThemeToggle ? this.#themeToggle(s) : null,
        el('span', { class: 'icon-btn', 'aria-hidden': 'true' }, '⛭'))
    );
  }

  #langSelect(s) {
    const labels = { 'zh-TW': '繁中', en: 'EN', ja: '日本語' };
    const select = el('select', {
      class: 'lang-select',
      'aria-label': s.a11y.language,
      'data-focus-key': 'lang',
      onchange: (e) => this.vm.setLang(e.target.value)
    }, ...s.languages.map((l) =>
      el('option', { value: l, selected: l === s.lang ? '' : null }, labels[l] || l)));
    select.value = s.lang;
    return select;
  }

  #themeToggle(s) {
    return el('button', {
      class: 'icon-btn',
      type: 'button',
      role: 'switch',
      'aria-checked': String(s.theme === 'light'),
      'aria-label': s.a11y.toggleTheme,
      'data-focus-key': 'theme',
      onclick: () => this.vm.toggleTheme()
    }, s.theme === 'dark' ? '☀' : '☾');
  }

  /* --- 主要區域 ---------------------------------------------------------- */

  #main(s) {
    return el('div', { class: 'main' },
      el('div', { class: 'activity', 'aria-hidden': 'true' },
        el('span', { class: 'activity__item--active' }, '▤'),
        el('span', {}, '⑂'),
        el('span', {}, '⌕'),
        el('span', {}, '◈'),
        el('div', { class: 'activity__spacer' }),
        el('span', {}, '▶'),
        el('span', {}, '⚑')),
      this.#sidebar(s),
      this.#resizer('sidebar', s),
      this.#editor(s));
  }

  #sidebar(s) {
    const nodes = s.tree.map((node, i) => {
      const attrs = {
        class: 'tree__node'
          + (node.isFile ? ' tree__node--file' : '')
          + (node.active ? ' tree__node--active' : ''),
        style: `padding-left:${node.indent}px`,
        type: 'button',
        role: 'treeitem',
        'aria-selected': node.isFile ? String(node.active) : null,
        tabindex: node.isFile ? (node.active || (!s.hasFile && i === 0) ? '0' : '-1') : '-1',
        'data-focus-key': `tree:${node.file || node.label}`,
        'data-file': node.file || null
      };
      if (node.isFile) {
        attrs.onclick = () => this.vm.open(node.file);
        attrs.onkeydown = (e) => this.#onTreeKey(e);
      }
      return el('button', attrs,
        el('span', {
          class: 'tree__icon',
          'aria-hidden': 'true',
          style: `background:${node.iconBg}`
        }, node.icon || ''),
        el('span', {
          class: 'tree__label' + (node.bright ? ' tree__label--bright' : '')
        }, node.label));
    });

    return el('aside', { class: 'sidebar' },
      el('div', { class: 'sidebar__header' },
        s.sidebarTitle,
        el('span', { class: 'sidebar__caret', 'aria-hidden': 'true' }, '⌄'),
        el('span', { class: 'sidebar__more', 'aria-hidden': 'true' }, '⋮')),
      el('div', {
        class: 'tree',
        role: 'tree',
        'aria-label': s.a11y.fileTree,
        'data-scroll': 'tree'
      }, ...nodes));
  }

  #editor(s) {
    return el('div', { class: 'editor' },
      this.#tabBar(s),
      el('div', { class: 'workspace' },
        s.hasFile ? this.#codePane(s) : this.#empty(s),
        s.showPreview ? this.#resizer('preview', s) : null,
        s.showPreview ? this.#preview(s) : null));
  }

  #tabBar(s) {
    return el('div', {
      class: 'tabbar',
      role: 'tablist',
      'aria-label': s.a11y.openFiles,
      'data-scroll': 'tabbar'
    }, ...s.tabs.map((tab) =>
      el('div', {
        class: 'tab' + (tab.active ? ' tab--active' : ''),
        role: 'tab',
        tabindex: tab.active ? '0' : '-1',
        'aria-selected': String(tab.active),
        'data-focus-key': `tab:${tab.name}`,
        'data-tab': tab.name,
        onclick: () => this.vm.select(tab.name),
        onkeydown: (e) => this.#onTabKey(e, tab.name)
      },
      el('span', {
        class: 'tab__icon',
        'aria-hidden': 'true',
        style: `background:${tab.iconBg}`
      }, tab.icon),
      el('span', {}, tab.label),
      el('button', {
        class: 'tab__close',
        type: 'button',
        'aria-label': `${s.a11y.closeTab}: ${tab.label}`,
        onclick: (e) => { e.stopPropagation(); this.vm.close(tab.name); }
      }, '×'))));
  }

  #empty(s) {
    return el('div', { class: 'empty', id: 'code-region', tabindex: '-1' },
      ...s.hints.map((h) => el('div', { class: 'empty__row' },
        el('span', { class: 'empty__label' }, h.label),
        el('span', { class: 'empty__key' }, h.key))));
  }

  #codePane(s) {
    return el('div', { class: 'code-pane' },
      el('div', { class: 'breadcrumb' }, s.breadcrumb),
      el('div', {
        class: 'code',
        id: 'code-region',
        role: 'region',
        tabindex: '-1',
        'aria-label': s.a11y.codeEditor,
        'data-scroll': 'code'
      }, ...s.lines.map((line) =>
        el('div', { class: 'code__line' },
          el('span', { class: 'code__n', 'aria-hidden': 'true' }, String(line.n)),
          el('span', { class: 'code__text' },
            ...line.tokens.map((tk) => el('span', { class: `tk-${tk.c}` }, tk.t)))))));
  }

  #preview(s) {
    return el('aside', {
      class: 'preview',
      'aria-label': s.a11y.previewPanel,
      'data-scroll': 'preview'
    },
    el('div', { class: 'preview__header' }, s.previewTitle),
    el('div', { class: 'preview__body' },
      ...s.previewImages.map((img) =>
        el('img', { class: 'preview__img', src: img.url, alt: img.alt, loading: 'lazy' })),
      ...s.previewNotes.map((note) => el('p', { class: 'preview__note' }, note)),
      s.previewLinks.length
        ? el('div', { class: 'preview__links' },
          ...s.previewLinks.map((l) =>
            el('a', {
              class: 'preview__link',
              href: l.url,
              target: '_blank',
              rel: 'noopener'
            }, l.label)))
        : null));
  }

  /* --- 可拖拉的分隔線 ------------------------------------------------------ */

  /** @param {'sidebar'|'preview'} kind */
  #resizer(kind, s) {
    const bounds = s.panelBounds[kind];
    const width = kind === 'sidebar' ? s.sidebarWidth : s.previewWidth;
    return el('div', {
      class: `resizer resizer--${kind}`,
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-label': kind === 'sidebar' ? s.a11y.resizeSidebar : s.a11y.resizePreview,
      'aria-valuenow': String(width),
      'aria-valuemin': String(bounds.min),
      'aria-valuemax': String(bounds.max),
      tabindex: '0',
      'data-focus-key': `resize:${kind}`,
      onpointerdown: (e) => this.#onResizeStart(e, kind),
      onkeydown: (e) => this.#onResizeKey(e, kind),
      ondblclick: () => this.vm.resetPanelWidth(kind)
    });
  }

  #onResizeStart(e, kind) {
    if (e.button > 0 || isNarrow()) return;
    e.preventDefault();

    const node = e.currentTarget;
    const startX = e.clientX;
    const startW = kind === 'sidebar' ? this.vm.sidebarWidth : this.vm.previewWidth;
    const dir = kind === 'sidebar' ? 1 : -1;

    node.setPointerCapture(e.pointerId);
    document.body.classList.add('is-resizing');

    const move = (ev) => this.#setPanelWidth(kind, startW + dir * (ev.clientX - startX), node);
    const end = () => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', end);
      node.removeEventListener('pointercancel', end);
      document.body.classList.remove('is-resizing');
      try {
        node.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* 指標已經放開了 */
      }
    };

    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
  }

  #onResizeKey(e, kind) {
    if (e.key === 'Home') {
      e.preventDefault();
      this.vm.resetPanelWidth(kind);
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

    e.preventDefault();
    const dir = (kind === 'sidebar' ? 1 : -1) * (e.key === 'ArrowRight' ? 1 : -1);
    const current = kind === 'sidebar' ? this.vm.sidebarWidth : this.vm.previewWidth;
    this.#setPanelWidth(kind, current + dir * (e.shiftKey ? 64 : 16), e.currentTarget);
  }

  /**
   * 寫入新寬度。拖拉期間不重繪整棵 DOM，直接改 CSS 變數，
   * 並確保中間的程式碼區至少留 MIN_PANE 寬。
   */
  #setPanelWidth(kind, target, node) {
    const current = kind === 'sidebar' ? this.vm.sidebarWidth : this.vm.previewWidth;
    const pane = this.root.querySelector('.code-pane, .empty');
    const slack = pane ? pane.getBoundingClientRect().width - MIN_PANE : Infinity;

    const width = this.vm.setPanelWidth(kind, Math.min(target, current + slack));
    document.documentElement.style.setProperty(
      kind === 'sidebar' ? '--sidebar-width' : '--preview-width', `${width}px`);
    node?.setAttribute('aria-valuenow', String(width));
  }

  #build(s) {
    return el('section', { class: 'build' },
      el('div', { class: 'build__header' },
        el('span', { class: 'build__tab--active' }, 'Build'),
        el('span', {}, 'Logcat'),
        el('span', {}, 'Terminal'),
        el('button', {
          class: 'build__close',
          type: 'button',
          'aria-label': s.a11y.toggleBuild,
          'data-focus-key': 'build-close',
          onclick: () => this.vm.toggleBuild(false)
        }, '—')),
      el('div', { class: 'build__body', 'data-scroll': 'build' },
        ...s.buildLog.map((row) => el('div', { class: 'build__row' },
          el('span', { class: 'build__time' }, row.time),
          el('span', { class: `build__text build__text--${row.tone}` }, row.text)))));
  }

  #statusBar(s) {
    return el('footer', { class: 'statusbar' },
      el('button', {
        class: 'statusbar__btn',
        type: 'button',
        'aria-expanded': String(s.buildOpen),
        'data-focus-key': 'status-build',
        onclick: () => this.vm.toggleBuild()
      }, '▤ Build'),
      el('span', {}, s.topBar.user || ''),
      el('div', { class: 'statusbar__spacer' }),
      el('span', {}, s.caret),
      el('span', {}, s.statusBar.encoding || ''),
      el('span', {}, s.statusBar.language || ''),
      el('span', {}, `⑂ ${s.statusBar.branch || ''}`),
      el('span', { class: 'statusbar__mem' }, s.statusBar.memory || ''));
  }

  /* --- 鍵盤操作 ---------------------------------------------------------- */

  #onTreeKey(e) {
    const items = [...this.root.querySelectorAll('.tree__node--file')];
    const i = items.indexOf(e.currentTarget);
    if (i < 0) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = items[e.key === 'ArrowDown' ? Math.min(i + 1, items.length - 1) : Math.max(i - 1, 0)];
      next?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.vm.open(e.currentTarget.dataset.file);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      (e.key === 'Home' ? items[0] : items[items.length - 1])?.focus();
    }
  }

  #onTabKey(e, name) {
    const tabs = [...this.root.querySelectorAll('.tab')];
    const i = tabs.indexOf(e.currentTarget);

    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = tabs[e.key === 'ArrowRight' ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length];
      this.vm.select(next?.dataset.tab);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.vm.close(name);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.vm.select(name);
    }
  }

  #onGlobalKey(e) {
    if (e.key === 'Escape' && this.vm.drawerOpen) this.vm.toggleDrawer(false);
  }

  /* --- 捲動位置保存 ------------------------------------------------------- */

  #captureScroll() {
    const out = {};
    this.root.querySelectorAll('[data-scroll]').forEach((n) => {
      out[n.dataset.scroll] = { top: n.scrollTop, left: n.scrollLeft };
    });
    out.__file = this.vm.activeFile;
    return out;
  }

  #restoreScroll(saved) {
    this.root.querySelectorAll('[data-scroll]').forEach((n) => {
      const key = n.dataset.scroll;
      // 換檔案時程式碼區回到最上方，其餘面板維持原位
      if (key === 'code' && saved.__file !== this.vm.activeFile) return;
      const pos = saved[key];
      if (pos) { n.scrollTop = pos.top; n.scrollLeft = pos.left; }
    });
    this.root.querySelector('.tab--active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

/* --- 小工具 --------------------------------------------------------------- */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function setMeta(attr, name, content) {
  let tag = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, name);
    document.head.append(tag);
  }
  tag.setAttribute('content', content);
}

/** 手機版（抽屜排版）不提供拖拉 */
function isNarrow() {
  return window.matchMedia('(max-width: 899px)').matches;
}

function cssEscape(value) {
  return window.CSS?.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}

/** 亮色模式下把 accent 壓深，直到白底上的對比達 WCAG AA。 */
export function darkenForLight(hex) {
  const preset = ACCENT_ON_LIGHT[hex.toLowerCase()];
  if (preset) return preset;

  let out = hex;
  for (let step = 0; step < 20 && contrastOnWhite(out) < 4.5; step++) {
    out = lighten(out, -5);
  }
  return out;
}

function contrastOnWhite(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 21;
  const int = parseInt(m[1], 16);
  const lum = [(int >> 16) & 255, (int >> 8) & 255, int & 255]
    .map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
  return 1.05 / (lum + 0.05);
}

/** 以 HSL 調整亮度；delta 為百分點（正值變亮、負值變暗）。 */
export function lighten(hex, delta) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const nl = Math.min(100, Math.max(0, l * 100 + delta)) / 100;
  const c = (1 - Math.abs(2 * nl - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = nl - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const rgb = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]
  ][seg].map((v) => Math.round((v + mm) * 255));

  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
}
