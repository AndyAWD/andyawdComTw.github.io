/**
 * ViewModel — 持有狀態，並把 Model 的資料轉成 View 直接可用的形狀。
 * 完全不碰 DOM；狀態變更時發出 'change' 事件。
 */

import { highlightCode } from './highlight.js';

const THEME_STORAGE_KEY = 'andyawd.theme';

export class IdeViewModel extends EventTarget {
  /** @param {import('./model.js').SiteModel} model */
  constructor(model) {
    super();
    this.model = model;

    const defaults = model.ui.defaults || {};
    const fromHash = parseHash(location.hash, (n) => model.hasFile(n));

    this.tabs = fromHash.tabs.length
      ? fromHash.tabs
      : (defaults.openFiles || []).filter((n) => model.hasFile(n));
    this.activeFile = fromHash.active
      || (this.tabs.includes(defaults.activeFile) ? defaults.activeFile : this.tabs[0])
      || null;

    this.theme = resolveTheme(model.ui.theme);
    this.drawerOpen = false;
    this.buildOpen = model.ui.layout?.showBuildPanel !== false;
  }

  /* --- commands --------------------------------------------------------- */

  open(name) {
    if (!this.model.hasFile(name)) return;
    if (!this.tabs.includes(name)) this.tabs = [...this.tabs, name];
    this.activeFile = name;
    this.drawerOpen = false;
    this.#changed();
  }

  select(name) {
    if (!this.tabs.includes(name)) return;
    this.activeFile = name;
    this.#changed();
  }

  close(name) {
    const tabs = this.tabs.filter((t) => t !== name);
    if (tabs.length === this.tabs.length) return;
    this.tabs = tabs;
    if (this.activeFile === name) this.activeFile = tabs[tabs.length - 1] || null;
    this.#changed();
  }

  setLang(lang) {
    if (this.model.setLang(lang)) this.#changed();
  }

  setTheme(theme) {
    this.theme = theme === 'light' ? 'light' : 'dark';
    try {
      localStorage.setItem(THEME_STORAGE_KEY, this.theme);
    } catch (_) {
      /* ignore */
    }
    this.#changed();
  }

  toggleTheme() {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  toggleDrawer(force) {
    this.drawerOpen = typeof force === 'boolean' ? force : !this.drawerOpen;
    this.#changed();
  }

  toggleBuild(force) {
    this.buildOpen = typeof force === 'boolean' ? force : !this.buildOpen;
    this.#changed();
  }

  /** 後台預覽用：整包換資料後重繪。 */
  replaceData(payload) {
    this.model.replaceData(payload);
    this.tabs = this.tabs.filter((n) => this.model.hasFile(n));
    if (!this.tabs.includes(this.activeFile)) this.activeFile = this.tabs[0] || null;
    this.#changed();
  }

  /** 從網址 hash 還原開啟狀態（上一頁／下一頁）。 */
  syncFromHash() {
    const { tabs, active } = parseHash(location.hash, (n) => this.model.hasFile(n));
    if (!tabs.length && !active) return;
    this.tabs = tabs;
    this.activeFile = active;
    this.#changed();
  }

  get hash() {
    if (!this.tabs.length) return '';
    return `#${this.tabs.join(',')}|${this.activeFile || ''}`;
  }

  /* --- derived view state ----------------------------------------------- */

  getViewState() {
    const { model } = this;
    const t = (k) => model.t(k);
    const active = this.activeFile;
    const file = active ? model.getFile(active) : null;
    const layout = model.ui.layout || {};
    const theme = model.ui.theme || {};

    const tree = (model.content.tree || []).map((node) => {
      const f = node.file ? model.getFile(node.file) : null;
      return {
        indent: 10 + node.d * 15,
        label: node.file || node.label,
        icon: f ? f.icon : node.icon,
        iconBg: f ? f.iconBg : node.iconBg || 'transparent',
        isFile: Boolean(node.file),
        file: node.file || null,
        active: Boolean(node.file) && node.file === active,
        bright: Boolean(node.bright)
      };
    });

    const tabs = this.tabs.map((name) => {
      const f = model.getFile(name);
      return {
        name,
        label: name,
        icon: f.icon,
        iconBg: f.iconBg,
        active: name === active
      };
    });

    const lines = file ? highlightCode(model.resolve(file.codeTemplate)) : [];
    const pv = file && file.preview;
    const showPreview = Boolean(pv) && layout.showPreview !== false;

    return {
      lang: model.lang,
      languages: model.languages,
      theme: this.theme,
      allowThemeToggle: theme.allowToggle !== false,
      accent: theme.accent || '#3ddc84',
      fontSize: theme.fontSize || 13,
      sidebarWidth: layout.sidebarWidth || 268,
      previewWidth: layout.previewWidth || 340,
      drawerOpen: this.drawerOpen,

      menus: model.ui.menus || [],
      topBar: model.ui.topBar || {},
      statusBar: model.ui.statusBar || {},
      sidebarTitle: t('sidebar.title'),

      tree,
      tabs,
      hasFile: Boolean(file),
      breadcrumb: file ? file.breadcrumb : '',
      lines,
      caret: file ? `${lines.length}:1` : '—',

      showPreview,
      previewTitle: showPreview ? t(pv.titleKey) : '',
      previewImages: showPreview
        ? pv.images.map((img) => ({ url: img.url, alt: t(img.altKey) }))
        : [],
      previewNotes: showPreview ? pv.noteKeys.map(t) : [],
      previewLinks: showPreview
        ? pv.links.map((l) => ({ url: l.url, label: t(l.labelKey) }))
        : [],

      hints: (model.content.hints || []).map((h) => ({
        label: t(h.labelKey),
        key: t(h.keyKey)
      })),

      buildOpen: this.buildOpen,
      buildLog: (model.content.buildLog || []).map((row) => ({
        time: row.time,
        text: t(row.textKey),
        tone: row.tone || 'muted'
      })),

      meta: {
        title: t('site.title'),
        description: t('site.description')
      },
      a11y: {
        skipToCode: t('a11y.skipToCode'),
        fileTree: t('a11y.fileTree'),
        openFiles: t('a11y.openFiles'),
        closeTab: t('a11y.closeTab'),
        toggleSidebar: t('a11y.toggleSidebar'),
        toggleTheme: t('a11y.toggleTheme'),
        toggleBuild: t('a11y.toggleBuild'),
        language: t('a11y.language'),
        codeEditor: t('a11y.codeEditor'),
        previewPanel: t('a11y.previewPanel')
      }
    };
  }

  #changed() {
    this.dispatchEvent(new CustomEvent('change'));
  }
}

/** 主題決定順序：localStorage → prefers-color-scheme → ui.json */
function resolveTheme(themeConfig = {}) {
  if (themeConfig.allowToggle !== false) {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') return stored;
    } catch (_) {
      /* ignore */
    }
    if (themeConfig.mode === 'auto' || !themeConfig.mode) {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
  }
  return themeConfig.mode === 'light' ? 'light' : 'dark';
}

/** `#A.kt,B.kt|B.kt` → { tabs, active } */
function parseHash(hash, exists) {
  const raw = decodeURIComponent((hash || '').replace(/^#/, ''));
  if (!raw) return { tabs: [], active: null };

  const [tabPart, activePart] = raw.split('|');
  const tabs = tabPart.split(',').map((s) => s.trim()).filter(exists);
  const wanted = (activePart || '').trim();
  const active = tabs.includes(wanted) ? wanted : tabs[0] || null;
  return { tabs, active };
}
