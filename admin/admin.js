/**
 * 後台編輯器 — 純前端。載入 data/*.json，編輯後輸出格式化 JSON 讓使用者複製貼回。
 * 不寫檔、不呼叫任何 API、不儲存金鑰。
 */

const ACCENTS = ['#3ddc84', '#56a8f5', '#c77dbb', '#b3ae60'];
const ICON_COLORS = ['#3ddc84', '#56a8f5', '#c77dbb', '#b3ae60', '#7a7e85'];
const LANG_LABEL = { 'zh-TW': '繁體中文', en: 'English', ja: '日本語' };

const VIEWPORTS = {
  desktop: { w: 1440, h: 900, label: '桌面' },
  mobile: { w: 390, h: 844, label: '手機' }
};

const panel = document.getElementById('panel');
const previewFrame = document.getElementById('preview');
const stage = document.getElementById('stage');
const dirtyBadge = document.getElementById('dirty');
const liveToggle = document.getElementById('live');
const viewportBtn = document.getElementById('viewport');

let content = null;
let ui = null;
let dirty = false;
let previewReady = false;
let currentTab = 'ui';
let selectedFile = null;
let stringFilter = '';

/* --- 啟動 ---------------------------------------------------------------- */

init();

async function init() {
  document.querySelectorAll('.tabs__tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      render();
    });
  });

  document.getElementById('reload').addEventListener('click', async () => {
    if (dirty && !confirm('重新載入會捨棄尚未複製的修改，確定嗎？')) return;
    await load();
  });

  document.getElementById('theme').addEventListener('click', (e) => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    e.currentTarget.textContent = next === 'dark' ? '☀' : '☾';
    e.currentTarget.setAttribute('aria-checked', String(next === 'light'));
    try { localStorage.setItem('andyawd.theme', next); } catch (_) { /* ignore */ }
  });

  window.addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data?.type === 'andyawd:preview-ready') {
      previewReady = true;
      pushPreview();
    }
  });

  viewportBtn.addEventListener('click', () => {
    const next = viewportBtn.dataset.mode === 'desktop' ? 'mobile' : 'desktop';
    viewportBtn.dataset.mode = next;
    viewportBtn.textContent = VIEWPORTS[next].label;
    fitPreview();
  });

  window.addEventListener('resize', fitPreview);
  fitPreview();

  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  await load();
}

/** 讓 iframe 以真實視窗尺寸渲染，再等比縮放塞進預覽欄。 */
function fitPreview() {
  const vp = VIEWPORTS[viewportBtn.dataset.mode] || VIEWPORTS.desktop;
  previewFrame.style.width = `${vp.w}px`;
  previewFrame.style.height = `${vp.h}px`;

  const scale = Math.min(stage.clientWidth / vp.w, stage.clientHeight / vp.h, 1);
  const left = Math.max(0, (stage.clientWidth - vp.w * scale) / 2);
  previewFrame.style.transform = `translateX(${left}px) scale(${scale})`;
}

async function load() {
  const [c, u] = await Promise.all([
    fetch('../data/content.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch('../data/ui.json', { cache: 'no-cache' }).then((r) => r.json())
  ]);
  content = c;
  ui = u;
  selectedFile = Object.keys(content.files)[0] || null;
  setDirty(false);
  render();
  pushPreview();
}

/* --- 共用 ---------------------------------------------------------------- */

function setDirty(value) {
  dirty = value;
  dirtyBadge.textContent = value ? '已修改，記得輸出 JSON' : '尚未修改';
  dirtyBadge.className = 'badge ' + (value ? 'badge--dirty' : 'badge--clean');
}

let pushTimer = null;
function changed({ rerender = false } = {}) {
  setDirty(true);
  if (rerender) render();
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushPreview, 250);
}

function pushPreview() {
  if (!previewReady || !liveToggle.checked || !content) return;
  previewFrame.contentWindow.postMessage(
    { type: 'andyawd:preview', content, ui },
    location.origin
  );
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else if (k === 'value') node.value = v;
    else if (k === 'checked') node.checked = Boolean(v);
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

/** 文字輸入欄；onInput 收到新值 */
function textField(label, value, onInput, { block = false, rows = 0, type = 'text' } = {}) {
  const input = rows
    ? el('textarea', { rows: String(rows), oninput: (e) => onInput(e.target.value) })
    : el('input', { type, value: value ?? '', oninput: (e) => onInput(e.target.value) });
  if (rows) input.value = value ?? '';
  return el('div', { class: 'field' + (block ? ' field--block' : '') },
    el('label', {}, label), input);
}

function checkboxField(label, value, onChange) {
  return el('div', { class: 'field' },
    el('label', {}, label),
    el('input', { type: 'checkbox', checked: value, onchange: (e) => onChange(e.target.checked) }));
}

function selectField(label, value, options, onChange) {
  const select = el('select', { onchange: (e) => onChange(e.target.value) },
    ...options.map((o) => el('option', { value: o.value }, o.label)));
  select.value = value;
  return el('div', { class: 'field' }, el('label', {}, label), select);
}

/* --- 主渲染 -------------------------------------------------------------- */

function render() {
  document.querySelectorAll('.tabs__tab').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.tab === currentTab));
  });
  panel.textContent = '';
  if (!content) {
    panel.append(el('p', { class: 'hint' }, '載入中…'));
    return;
  }
  ({ ui: renderUi, tree: renderTree, files: renderFiles, strings: renderStrings, output: renderOutput })
    [currentTab]();
}

/* --- 1. 介面設定 ---------------------------------------------------------- */

function renderUi() {
  const theme = ui.theme;
  const layout = ui.layout;
  const defaults = ui.defaults;
  const fileNames = Object.keys(content.files);

  const swatches = el('div', { class: 'swatches' },
    ...ACCENTS.map((c) => el('button', {
      type: 'button',
      class: 'swatch',
      style: `background:${c}`,
      title: c,
      'aria-pressed': String(theme.accent.toLowerCase() === c),
      onclick: () => { theme.accent = c; changed({ rerender: true }); }
    })),
    el('input', {
      type: 'color',
      value: theme.accent,
      title: '自訂顏色',
      oninput: (e) => { theme.accent = e.target.value; changed(); }
    }),
    el('span', { class: 'inline' }, theme.accent));

  const fontRange = el('input', {
    type: 'range', min: '11', max: '18', value: String(theme.fontSize),
    oninput: (e) => {
      theme.fontSize = Number(e.target.value);
      e.target.nextElementSibling.textContent = `${theme.fontSize}px`;
      changed();
    }
  });

  panel.append(
    el('h2', {}, '主題'),
    el('div', { class: 'field' }, el('label', {}, '主色 accent'), swatches),
    el('p', { class: 'hint' },
      '亮色模式會自動把 accent 壓深，確保白底上的對比足夠，不需要另外設定。'),
    el('div', { class: 'field' },
      el('label', {}, '程式碼字型大小'),
      el('div', { class: 'inline' }, fontRange, el('span', {}, `${theme.fontSize}px`))),
    selectField('預設主題', theme.mode || 'dark', [
      { value: 'dark', label: '暗色（Darcula）' },
      { value: 'light', label: '亮色（IntelliJ Light）' },
      { value: 'auto', label: '跟隨系統設定' }
    ], (v) => { theme.mode = v; changed(); }),
    checkboxField('顯示主題切換鈕', theme.allowToggle !== false,
      (v) => { theme.allowToggle = v; changed(); }),

    el('h2', {}, '版面'),
    checkboxField('顯示 Preview 面板', layout.showPreview !== false,
      (v) => { layout.showPreview = v; changed(); }),
    checkboxField('顯示 Build 面板', layout.showBuildPanel !== false,
      (v) => { layout.showBuildPanel = v; changed(); }),
    textField('檔案樹寬度 (px)', layout.sidebarWidth,
      (v) => { layout.sidebarWidth = Number(v) || 268; changed(); }, { type: 'number' }),
    textField('Preview 寬度 (px)', layout.previewWidth,
      (v) => { layout.previewWidth = Number(v) || 340; changed(); }, { type: 'number' }),

    el('h2', {}, '預設狀態'),
    selectField('預設語言', defaults.lang,
      content.languages.map((l) => ({ value: l, label: LANG_LABEL[l] || l })),
      (v) => { defaults.lang = v; changed(); }),
    el('div', { class: 'field field--block' },
      el('label', {}, '一進站就開啟的分頁'),
      el('div', {}, ...fileNames.map((name) => el('label', { class: 'inline', style: 'margin-right:14px' },
        el('input', {
          type: 'checkbox',
          checked: defaults.openFiles.includes(name),
          onchange: (e) => {
            defaults.openFiles = e.target.checked
              ? [...defaults.openFiles, name]
              : defaults.openFiles.filter((n) => n !== name);
            changed({ rerender: true });
          }
        }), name)))),
    selectField('預設選取的分頁', defaults.activeFile,
      defaults.openFiles.map((n) => ({ value: n, label: n })),
      (v) => { defaults.activeFile = v; changed(); }),

    el('h2', {}, '頂部列與狀態列'),
    textField('使用者名稱', ui.topBar.user, (v) => { ui.topBar.user = v; changed(); }),
    textField('裝置字串', ui.topBar.device, (v) => { ui.topBar.device = v; changed(); }),
    textField('分支名稱', ui.statusBar.branch, (v) => { ui.statusBar.branch = v; changed(); }),
    textField('編碼', ui.statusBar.encoding, (v) => { ui.statusBar.encoding = v; changed(); }),
    textField('語言標示', ui.statusBar.language, (v) => { ui.statusBar.language = v; changed(); }),
    textField('記憶體字串', ui.statusBar.memory, (v) => { ui.statusBar.memory = v; changed(); }),
    textField('選單項目（一行一個）', ui.menus.join('\n'),
      (v) => { ui.menus = v.split('\n').map((s) => s.trim()).filter(Boolean); changed(); },
      { block: true, rows: 6 })
  );
}

/* --- 2. 檔案樹 ------------------------------------------------------------ */

function renderTree() {
  const fileNames = Object.keys(content.files);

  const rows = content.tree.map((node, i) => el('div', { class: 'row row--tree' },
    el('input', {
      type: 'number', min: '0', max: '6', value: String(node.d), style: 'width:56px',
      title: '縮排層級',
      oninput: (e) => { node.d = Number(e.target.value) || 0; changed(); }
    }),
    node.file
      ? (() => {
        const s = el('select', {
          onchange: (e) => { node.file = e.target.value; changed({ rerender: true }); }
        }, ...fileNames.map((n) => el('option', { value: n }, n)));
        s.value = node.file;
        return el('div', { class: 'row__grow row__grow--split' }, s,
          el('input', {
            type: 'text', value: node.labelKey || '', placeholder: '顯示名稱 key（留空就顯示檔名）',
            title: '樹上與分頁要顯示的文字 key，例如 tree.ph',
            oninput: (e) => { node.labelKey = e.target.value.trim() || undefined; changed(); }
          }));
      })()
      : el('div', { class: 'row__grow' },
        el('input', {
          type: 'text', value: node.label, placeholder: '資料夾名稱',
          oninput: (e) => { node.label = e.target.value; changed(); }
        })),
    node.file ? null : el('input', {
      type: 'text', value: node.icon || '', style: 'width:46px', title: '圖示字元',
      oninput: (e) => { node.icon = e.target.value; changed(); }
    }),
    node.file ? null : el('input', {
      type: 'color', value: node.iconBg || '#7a7e85', title: '圖示底色',
      oninput: (e) => { node.iconBg = e.target.value; changed(); }
    }),
    el('div', { class: 'row__actions' },
      el('button', {
        type: 'button', class: 'btn btn--small', title: '上移',
        onclick: () => { move(content.tree, i, -1); changed({ rerender: true }); }
      }, '↑'),
      el('button', {
        type: 'button', class: 'btn btn--small', title: '下移',
        onclick: () => { move(content.tree, i, 1); changed({ rerender: true }); }
      }, '↓'),
      el('button', {
        type: 'button', class: 'btn btn--small btn--danger', title: '刪除',
        onclick: () => { content.tree.splice(i, 1); changed({ rerender: true }); }
      }, '×'))));

  panel.append(
    el('h2', {}, '檔案樹'),
    el('p', { class: 'hint' },
      '這棵樹就是網站的主導覽。層級數字是縮排深度（0 是根節點），檔案節點點下去會開新分頁。'
      + '檔案節點可以填「顯示名稱 key」，樹上與分頁就會改顯示該筆多語文字，留空則顯示檔名。'),
    el('div', { class: 'toolbar' },
      el('button', {
        type: 'button', class: 'btn',
        onclick: () => {
          content.tree.push({ d: 1, label: '新資料夾', icon: '▾', iconBg: '#7a7e85' });
          changed({ rerender: true });
        }
      }, '+ 新增資料夾'),
      el('button', {
        type: 'button', class: 'btn',
        onclick: () => {
          if (!fileNames.length) return alert('請先到「檔案內容」新增一個檔案。');
          content.tree.push({ d: 3, file: fileNames[0] });
          changed({ rerender: true });
        }
      }, '+ 新增檔案節點')),
    ...rows);
}

function move(arr, i, delta) {
  const j = i + delta;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

/* --- 3. 檔案內容 ---------------------------------------------------------- */

function renderFiles() {
  const names = Object.keys(content.files);
  if (!names.includes(selectedFile)) selectedFile = names[0] || null;

  const picker = el('select', {
    onchange: (e) => { selectedFile = e.target.value; render(); }
  }, ...names.map((n) => el('option', { value: n }, n)));
  picker.value = selectedFile || '';

  panel.append(
    el('h2', {}, '檔案內容'),
    el('div', { class: 'toolbar' },
      picker,
      el('button', {
        type: 'button', class: 'btn',
        onclick: () => {
          const name = prompt('新檔案名稱（例如 NewProject.kt）');
          if (!name || content.files[name]) return;
          content.files[name] = {
            icon: 'O', iconBg: '#b3ae60',
            breadcrumb: `androidWebsite > kotlin > tw.com.andyawd > ${name}`,
            codeTemplate: 'package tw.com.andyawd\n',
            preview: null
          };
          selectedFile = name;
          changed({ rerender: true });
        }
      }, '+ 新增檔案'),
      el('button', {
        type: 'button', class: 'btn btn--danger',
        onclick: () => {
          if (!selectedFile || !confirm(`確定刪除 ${selectedFile}？`)) return;
          delete content.files[selectedFile];
          content.tree = content.tree.filter((n) => n.file !== selectedFile);
          selectedFile = Object.keys(content.files)[0] || null;
          changed({ rerender: true });
        }
      }, '刪除這個檔案')));

  if (!selectedFile) return;
  const file = content.files[selectedFile];

  panel.append(
    el('div', { class: 'field' },
      el('label', {}, '圖示字元／底色'),
      el('div', { class: 'inline' },
        el('input', {
          type: 'text', value: file.icon, style: 'width:46px',
          oninput: (e) => { file.icon = e.target.value; changed(); }
        }),
        ...ICON_COLORS.map((c) => el('button', {
          type: 'button', class: 'swatch', style: `background:${c};width:20px;height:20px`,
          'aria-pressed': String(file.iconBg.toLowerCase() === c),
          onclick: () => { file.iconBg = c; changed({ rerender: true }); }
        })))),
    textField('breadcrumb', file.breadcrumb, (v) => { file.breadcrumb = v; changed(); }),
    el('h2', {}, '程式碼樣板'),
    el('p', { class: 'hint' },
      '要翻譯的字串與註解請寫成 ${key} 佔位符，實際文字放在「字串表」。'
      + '關鍵字、變數名維持英文，三種語言共用同一份骨架。'),
    textField('codeTemplate', file.codeTemplate,
      (v) => { file.codeTemplate = v; changed(); }, { block: true, rows: 20 }),

    el('h2', {}, 'Preview 面板'),
    checkboxField('這個檔案有 Preview', Boolean(file.preview), (v) => {
      file.preview = v
        ? { titleKey: '', images: [], noteKeys: [], links: [] }
        : null;
      changed({ rerender: true });
    })
  );

  if (!file.preview) return;
  const pv = file.preview;

  panel.append(
    textField('標題 key', pv.titleKey, (v) => { pv.titleKey = v; changed(); }),

    el('h2', {}, '截圖'),
    ...pv.images.map((img, i) => el('div', { class: 'row' },
      el('div', { class: 'row__grow' },
        textField('圖片路徑', img.url, (v) => { img.url = v; changed(); }, { block: true }),
        textField('alt 文字 key', img.altKey, (v) => { img.altKey = v; changed(); }, { block: true })),
      el('div', { class: 'row__actions' },
        el('button', {
          type: 'button', class: 'btn btn--small btn--danger',
          onclick: () => { pv.images.splice(i, 1); changed({ rerender: true }); }
        }, '×')))),
    el('button', {
      type: 'button', class: 'btn',
      onclick: () => { pv.images.push({ url: '', altKey: '' }); changed({ rerender: true }); }
    }, '+ 新增截圖'),

    el('h2', {}, '說明文字'),
    ...pv.noteKeys.map((key, i) => el('div', { class: 'row' },
      el('div', { class: 'row__grow' },
        el('input', {
          type: 'text', value: key, placeholder: '字串 key',
          oninput: (e) => { pv.noteKeys[i] = e.target.value; changed(); }
        })),
      el('div', { class: 'row__actions' },
        el('button', {
          type: 'button', class: 'btn btn--small btn--danger',
          onclick: () => { pv.noteKeys.splice(i, 1); changed({ rerender: true }); }
        }, '×')))),
    el('button', {
      type: 'button', class: 'btn',
      onclick: () => { pv.noteKeys.push(''); changed({ rerender: true }); }
    }, '+ 新增說明'),

    el('h2', {}, '連結'),
    ...pv.links.map((link, i) => el('div', { class: 'row' },
      el('div', { class: 'row__grow' },
        textField('網址', link.url, (v) => { link.url = v; changed(); }, { block: true, type: 'url' }),
        textField('文字 key', link.labelKey, (v) => { link.labelKey = v; changed(); }, { block: true })),
      el('div', { class: 'row__actions' },
        el('button', {
          type: 'button', class: 'btn btn--small btn--danger',
          onclick: () => { pv.links.splice(i, 1); changed({ rerender: true }); }
        }, '×')))),
    el('button', {
      type: 'button', class: 'btn',
      onclick: () => { pv.links.push({ url: '', labelKey: '' }); changed({ rerender: true }); }
    }, '+ 新增連結')
  );
}

/* --- 4. 字串表 ------------------------------------------------------------ */

function renderStrings() {
  const { used, missing, unused } = analyseKeys();
  const langs = content.languages;
  const keys = Object.keys(content.strings)
    .filter((k) => !stringFilter
      || k.toLowerCase().includes(stringFilter)
      || langs.some((l) => (content.strings[k][l] || '').toLowerCase().includes(stringFilter)));

  const untranslated = Object.entries(content.strings)
    .filter(([, v]) => langs.some((l) => !v[l]?.trim())).length;

  panel.append(
    el('h2', {}, '字串表'),
    el('div', { class: 'issues' },
      el('div', {},
        el('span', { class: untranslated ? 'warn' : 'ok' },
          untranslated ? `⚠ ${untranslated} 個 key 還缺翻譯` : '✓ 三語都齊了'),
        ' ｜ ',
        el('span', { class: missing.length ? 'err' : 'ok' },
          missing.length ? `✗ ${missing.length} 個被引用的 key 不存在` : '✓ 引用的 key 都存在'),
        ' ｜ ',
        el('span', { class: unused.length ? 'warn' : 'ok' },
          unused.length ? `⚠ ${unused.length} 個 key 沒被用到` : '✓ 沒有多餘的 key')),
      missing.length ? el('ul', {}, ...missing.map((k) => el('li', { class: 'err' }, k))) : null,
      unused.length ? el('ul', {}, ...unused.map((k) => el('li', { class: 'warn' }, k))) : null),

    el('div', { class: 'toolbar' },
      el('input', {
        type: 'text', value: stringFilter, placeholder: '搜尋 key 或內容…',
        oninput: (e) => {
          stringFilter = e.target.value.toLowerCase();
          const pos = e.target.selectionStart;
          render();
          const next = panel.querySelector('.toolbar input[type="text"]');
          next.focus();
          next.setSelectionRange(pos, pos);
        }
      }),
      el('button', {
        type: 'button', class: 'btn',
        onclick: () => {
          const key = prompt('新的 key（例如 fp.feature4）');
          if (!key || content.strings[key]) return;
          content.strings[key] = Object.fromEntries(langs.map((l) => [l, '']));
          changed({ rerender: true });
        }
      }, '+ 新增 key'),
      el('span', { class: 'inline' }, `顯示 ${keys.length} / ${Object.keys(content.strings).length}`)),

    ...keys.map((key) => {
      const entry = content.strings[key];
      const incomplete = langs.some((l) => !entry[l]?.trim());
      return el('div', { class: 'row string-row' + (incomplete ? ' string-row--missing' : '') },
        el('div', { class: 'row__grow' },
          el('div', { class: 'string-key' },
            el('code', {}, key),
            used.has(key) ? null : el('span', { class: 'warn' }, '未被使用')),
          el('div', { class: 'grid3' },
            ...langs.map((lang) => el('div', {},
              el('label', {}, LANG_LABEL[lang] || lang),
              (() => {
                const ta = el('textarea', {
                  rows: '3',
                  oninput: (e) => { entry[lang] = e.target.value; setDirty(true); schedulePush(); }
                });
                ta.value = entry[lang] || '';
                if (!entry[lang]?.trim()) ta.style.borderColor = '#e0a03a';
                return ta;
              })())))),
        el('div', { class: 'row__actions' },
          el('button', {
            type: 'button', class: 'btn btn--small btn--danger',
            onclick: () => {
              if (!confirm(`刪除 ${key}？`)) return;
              delete content.strings[key];
              changed({ rerender: true });
            }
          }, '×')));
    })
  );
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushPreview, 250);
}

/** 掃描所有引用到的 key，找出「引用但不存在」與「存在但沒用到」。 */
function analyseKeys() {
  const used = new Set();
  const re = /\$\{([^}]+)\}/g;

  for (const file of Object.values(content.files)) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(file.codeTemplate || ''))) used.add(m[1].trim());
    const pv = file.preview;
    if (!pv) continue;
    if (pv.titleKey) used.add(pv.titleKey);
    pv.images.forEach((i) => i.altKey && used.add(i.altKey));
    pv.noteKeys.forEach((k) => k && used.add(k));
    pv.links.forEach((l) => l.labelKey && used.add(l.labelKey));
  }
  (content.tree || []).forEach((n) => n.labelKey && used.add(n.labelKey));
  (content.buildLog || []).forEach((b) => b.textKey && used.add(b.textKey));
  (content.hints || []).forEach((h) => {
    if (h.labelKey) used.add(h.labelKey);
    if (h.keyKey) used.add(h.keyKey);
  });

  // 由 view/viewmodel 直接查表、不會出現在資料裡的固定 key
  const BUILTIN = ['site.title', 'site.description', 'sidebar.title'];
  BUILTIN.forEach((k) => used.add(k));
  Object.keys(content.strings).filter((k) => k.startsWith('a11y.')).forEach((k) => used.add(k));

  const existing = new Set(Object.keys(content.strings));
  return {
    used,
    missing: [...used].filter((k) => !existing.has(k)).sort(),
    unused: [...existing].filter((k) => !used.has(k)).sort()
  };
}

/* --- 5. 輸出 -------------------------------------------------------------- */

function renderOutput() {
  panel.append(
    el('h2', {}, '輸出 JSON'),
    el('p', { class: 'hint' },
      '把下面兩份內容分別貼回 data/content.json 與 data/ui.json，'
      + '然後 git commit、push 就會上線。這個頁面不會自己寫檔。'),
    outputBox('data/content.json', content, 'content.json'),
    outputBox('data/ui.json', ui, 'ui.json'));
}

function outputBox(title, data, filename) {
  const json = JSON.stringify(data, null, 2) + '\n';
  const ta = el('textarea', { readonly: '', spellcheck: 'false' });
  ta.value = json;

  return el('div', { class: 'output-box' },
    el('div', { class: 'toolbar' },
      el('strong', {}, title),
      el('button', {
        type: 'button', class: 'btn',
        onclick: async (e) => {
          try {
            await navigator.clipboard.writeText(json);
          } catch (_) {
            ta.select();
            document.execCommand('copy');
          }
          const btn = e.currentTarget;
          btn.textContent = '已複製 ✓';
          setTimeout(() => { btn.textContent = '複製'; }, 1500);
        }
      }, '複製'),
      el('button', {
        type: 'button', class: 'btn',
        onclick: () => {
          const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
          const a = el('a', { href: url, download: filename });
          a.click();
          URL.revokeObjectURL(url);
        }
      }, '下載'),
      el('span', { class: 'inline' }, `${(json.length / 1024).toFixed(1)} KB`)),
    ta);
}
