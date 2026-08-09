/**
 * ViewModel — 持有狀態，並把 Model 的資料轉成 View 直接可用的形狀。
 * 完全不碰 DOM；狀態變更時發出 'change' 事件。
 */

import { highlightCode } from './highlight.js';

const THEME_STORAGE_KEY = 'andyawd.theme';

/** 兩個可拖拉面板的設定：localStorage key、預設寬度、允許範圍 */
const PANELS = {
  sidebar: { storageKey: 'andyawd.sidebarWidth', configKey: 'sidebarWidth', fallback: 268, min: 160, max: 560 },
  preview: { storageKey: 'andyawd.previewWidth', configKey: 'previewWidth', fallback: 340, min: 240, max: 900 }
};

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

    // 面板寬度：localStorage（使用者拖拉過的）→ ui.json → 內建預設
    this.sidebarWidth = resolveWidth('sidebar', model.ui.layout);
    this.previewWidth = resolveWidth('preview', model.ui.layout);
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

  /**
   * 設定面板寬度並記住。
   * 拖拉期間會連續呼叫，因此刻意「不」發出 change —— 整棵 DOM 重繪會掉幀，
   * 也會讓正在拖的分隔線失去 pointer capture。View 自己直接設 CSS 變數。
   * @param {'sidebar'|'preview'} which
   * @param {number} px
   * @returns {number} 實際採用（夾過範圍）的寬度
   */
  setPanelWidth(which, px) {
    const panel = PANELS[which];
    if (!panel) return 0;

    const width = clampWidth(which, px);
    this[panel.configKey] = width;
    try {
      localStorage.setItem(panel.storageKey, String(width));
    } catch (_) {
      /* ignore */
    }
    return width;
  }

  /** 還原成 ui.json 的預設寬度（雙擊分隔線或按 Home）。 */
  resetPanelWidth(which) {
    const panel = PANELS[which];
    if (!panel) return;

    try {
      localStorage.removeItem(panel.storageKey);
    } catch (_) {
      /* ignore */
    }
    this[panel.configKey] = defaultWidth(which, this.model.ui.layout);
    this.#changed();
  }

  /** 某個面板的預設寬度（供 reset 與範圍提示用）。 */
  panelDefault(which) {
    return defaultWidth(which, this.model.ui.layout);
  }

  /** 後台預覽用：整包換資料後重繪。 */
  replaceData(payload) {
    this.model.replaceData(payload);
    this.tabs = this.tabs.filter((n) => this.model.hasFile(n));
    if (!this.tabs.includes(this.activeFile)) this.activeFile = this.tabs[0] || null;
    // 後台調整寬度時要即時反映；使用者自己拖過的（存在 localStorage）優先。
    this.sidebarWidth = resolveWidth('sidebar', this.model.ui.layout);
    this.previewWidth = resolveWidth('preview', this.model.ui.layout);
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

    // 檔案樹上的 labelKey 決定「檔名 → 顯示名稱」，分頁標籤共用同一份，兩邊才會一致。
    const labelKeys = new Map();
    (model.content.tree || []).forEach((node) => {
      if (node.file && node.labelKey) labelKeys.set(node.file, node.labelKey);
    });
    const fileLabel = (name) => (labelKeys.has(name) ? t(labelKeys.get(name)) : name);

    const tree = (model.content.tree || []).map((node) => {
      const f = node.file ? model.getFile(node.file) : null;
      return {
        indent: 10 + node.d * 15,
        label: node.file ? fileLabel(node.file) : node.label,
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
        label: fileLabel(name),
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
      sidebarWidth: this.sidebarWidth,
      previewWidth: this.previewWidth,
      panelBounds: {
        sidebar: { min: PANELS.sidebar.min, max: PANELS.sidebar.max },
        preview: { min: PANELS.preview.min, max: PANELS.preview.max }
      },
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
        previewPanel: t('a11y.previewPanel'),
        resizeSidebar: t('a11y.resizeSidebar'),
        resizePreview: t('a11y.resizePreview')
      }
    };
  }

  #changed() {
    this.dispatchEvent(new CustomEvent('change'));
  }
}

/** 面板寬度決定順序：localStorage → ui.json → 內建預設 */
function resolveWidth(which, layout = {}) {
  const panel = PANELS[which];
  // 後台 ?preview=1 的即時預覽要忠實呈現 ui.json，不受編輯者自己拖過的寬度干擾
  if (!isAdminPreview()) {
    try {
      const stored = Number(localStorage.getItem(panel.storageKey));
      if (Number.isFinite(stored) && stored > 0) return clampWidth(which, stored);
    } catch (_) {
      /* ignore */
    }
  }
  return defaultWidth(which, layout);
}

function isAdminPreview() {
  return new URLSearchParams(location.search).get('preview') === '1';
}

function defaultWidth(which, layout = {}) {
  const panel = PANELS[which];
  return clampWidth(which, Number(layout[panel.configKey]) || panel.fallback);
}

function clampWidth(which, px) {
  const panel = PANELS[which];
  return Math.round(Math.min(panel.max, Math.max(panel.min, Number(px) || panel.fallback)));
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
