/**
 * 產生 assets/fonts/ 底下的自行託管字型。
 *
 * 用法（需要 Node 18+）：
 *   cd doc/tools
 *   npm install subset-font
 *   node build-fonts.mjs
 *
 * 做兩件事：
 * 1. 從 Google Fonts 抓 JetBrains Mono 的 latin / latin-ext subset。
 * 2. 抓 Noto Sans TC / JP 的可變字型，縮減成 data/*.json 與 index.html
 *    實際用到的字元，各輸出 400 / 700 兩個字重。
 *
 * 在 /admin/ 新增中日文內容後如果網站出現缺字，重跑這支腳本即可。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'assets/fonts');
const CACHE = path.join(HERE, '.cache');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

/* --- 1. 網站實際用到的字元 ------------------------------------------------ */

const sources = ['data/content.json', 'data/ui.json', 'index.html'];
const texts = sources.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('');

// 常用全形標點的安全邊際，之後新增內容比較不容易缺字
const EXTRA = '　、。，．・？！：；「」『』（）〔〕【】《》〈〉…—～＋－＝％＃＠＆＊';
const chars = [...new Set([...texts, ...EXTRA])].join('');
console.log(`來源字元：${[...chars].length} 個相異字元`);

/* --- 2. JetBrains Mono（拉丁） ------------------------------------------- */

const JB_CSS = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap';
const KEEP_SUBSETS = new Set(['latin', 'latin-ext']);

const cssRes = await fetch(JB_CSS, { headers: { 'User-Agent': UA } });
if (!cssRes.ok) throw new Error(`取得 JetBrains Mono CSS 失敗（${cssRes.status}）`);
const jbCss = await cssRes.text();

const faces = [];
const faceRe = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{([^}]+)}/g;
let m;
while ((m = faceRe.exec(jbCss))) {
  const [, subset, body] = m;
  if (!KEEP_SUBSETS.has(subset)) continue;
  faces.push({
    subset,
    weight: /font-weight:\s*(\d+)/.exec(body)[1],
    url: /url\((https:[^)]+)\)/.exec(body)[1],
    range: /unicode-range:\s*([^;]+);/.exec(body)[1].trim(),
  });
}

const css = [
  '/* 自行託管字型 — 由 doc/tools/build-fonts.mjs 產生，請勿手動編輯。',
  ' *',
  ' * JetBrains Mono：Google Fonts 原始 subset，只保留 latin 與 latin-ext。',
  ' * Noto Sans TC / JP：用 subset-font 縮減成網站現有內容實際用到的字元（各約 120 KB）。',
  ' *   在 /admin/ 新增中日文內容後如果出現缺字，重新執行 doc/tools/build-fonts.mjs 即可。',
  ' *   沒有涵蓋到的字會退回系統 CJK 字型，不會破版。',
  ' */',
  '',
  '/* --- JetBrains Mono ----------------------------------------------------- */',
  '',
];

for (const f of faces) {
  const file = `jetbrains-mono-${f.weight}-${f.subset}.woff2`;
  const res = await fetch(f.url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`下載失敗 ${f.url}`);
  fs.writeFileSync(path.join(OUT, file), Buffer.from(await res.arrayBuffer()));
  css.push(
    '@font-face {',
    "  font-family: 'JetBrains Mono';",
    '  font-style: normal;',
    `  font-weight: ${f.weight};`,
    '  font-display: swap;',
    `  src: url('./${file}') format('woff2');`,
    `  unicode-range: ${f.range};`,
    '}',
    ''
  );
  console.log(`  ${file}`);
}

/* --- 3. Noto Sans TC / JP（CJK subset） ----------------------------------- */

const CJK = [
  {
    slug: 'noto-sans-tc',
    family: 'Noto Sans TC',
    url: 'https://github.com/google/fonts/raw/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf',
  },
  {
    slug: 'noto-sans-jp',
    family: 'Noto Sans JP',
    url: 'https://github.com/google/fonts/raw/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf',
  },
];

for (const font of CJK) {
  css.push(`/* --- ${font.family} ------------------------------------------------------- */`, '');

  const cached = path.join(CACHE, `${font.slug}.ttf`);
  if (!fs.existsSync(cached)) {
    console.log(`下載 ${font.family} 可變字型…`);
    const res = await fetch(font.url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`下載失敗 ${font.url}（${res.status}）`);
    fs.writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
  }
  const src = fs.readFileSync(cached);

  for (const weight of [400, 700]) {
    const buf = await subsetFont(src, chars, {
      targetFormat: 'woff2',
      variationAxes: { wght: { min: weight, max: weight, default: weight } },
    });
    const file = `${font.slug}-${weight}.woff2`;
    fs.writeFileSync(path.join(OUT, file), buf);
    console.log(`  ${file}  ${(buf.length / 1024).toFixed(1)} KB`);
    css.push(
      '@font-face {',
      `  font-family: '${font.family}';`,
      '  font-style: normal;',
      `  font-weight: ${weight};`,
      '  font-display: swap;',
      `  src: url('./${file}') format('woff2');`,
      '}',
      ''
    );
  }
}

fs.writeFileSync(path.join(OUT, 'fonts.css'), css.join('\n'), 'utf8');
console.log('\n完成：assets/fonts/fonts.css 已更新。');
