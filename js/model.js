/**
 * Model — 只負責資料：載入兩份 JSON、決定語言、提供字串查表與樣板解析。
 * 完全不知道 DOM 的存在。
 */

const LANG_STORAGE_KEY = 'andyawd.lang';
const PLACEHOLDER_RE = /\$\{([^}]+)\}/g;

export class SiteModel {
  /**
   * @param {object} content data/content.json
   * @param {object} ui      data/ui.json
   */
  constructor(content, ui) {
    this.content = content;
    this.ui = ui;
    this.lang = resolveLang(content.languages, ui.defaults?.lang);
  }

  static async load({ contentUrl = 'data/content.json', uiUrl = 'data/ui.json' } = {}) {
    const [content, ui] = await Promise.all([fetchJson(contentUrl), fetchJson(uiUrl)]);
    return new SiteModel(content, ui);
  }

  get languages() {
    return this.content.languages;
  }

  setLang(lang) {
    if (!this.languages.includes(lang)) return false;
    this.lang = lang;
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch (_) {
      /* 無痕模式等情況下忽略 */
    }
    return true;
  }

  /** 取單一字串；找不到時退回 key 本身，方便發現漏翻。 */
  t(key) {
    const entry = this.content.strings?.[key];
    if (!entry) return key;
    return entry[this.lang] || entry[this.languages[0]] || key;
  }

  /** 把 `${key}` 佔位符換成目前語言的字串。 */
  resolve(template) {
    if (!template) return '';
    return template.replace(PLACEHOLDER_RE, (_, key) => this.t(key.trim()));
  }

  getFile(name) {
    return this.content.files?.[name] || null;
  }

  hasFile(name) {
    return Boolean(this.content.files?.[name]);
  }

  /** 檔案樹中所有可開啟的檔名，依樹狀順序。 */
  get fileNames() {
    return (this.content.tree || []).filter((n) => n.file).map((n) => n.file);
  }

  /** 讓後台預覽用：整包換掉資料後重新計算語言。 */
  replaceData({ content, ui }) {
    if (content) this.content = content;
    if (ui) this.ui = ui;
    if (!this.content.languages.includes(this.lang)) {
      this.lang = this.content.languages[0];
    }
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`載入 ${url} 失敗（HTTP ${res.status}）`);
  return res.json();
}

/** 語言決定順序：?lang= → localStorage → navigator.language → ui.json 預設 */
function resolveLang(languages, fallback) {
  const candidates = [];

  const param = new URLSearchParams(location.search).get('lang');
  if (param) candidates.push(param);

  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored) candidates.push(stored);
  } catch (_) {
    /* ignore */
  }

  for (const nav of navigator.languages || [navigator.language]) {
    if (nav) candidates.push(nav);
  }

  if (fallback) candidates.push(fallback);

  for (const c of candidates) {
    const exact = languages.find((l) => l.toLowerCase() === c.toLowerCase());
    if (exact) return exact;
    const base = c.split('-')[0].toLowerCase();
    const loose = languages.find((l) => l.split('-')[0].toLowerCase() === base);
    if (loose) return loose;
  }

  return languages[0];
}
