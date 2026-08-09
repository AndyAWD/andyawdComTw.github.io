/**
 * Kotlin 語法高亮 tokenizer。
 * 規則沿用設計稿，但輸出 CSS class 而不是 inline 顏色，
 * 切換亮／暗主題時才不需要重新 tokenize。
 */

const KEYWORDS = [
  'package', 'import', 'class', 'object', 'val', 'var', 'fun', 'override',
  'private', 'internal', 'return', 'true', 'false', 'null', 'data', 'const',
  'listOf', 'mapOf', 'if', 'else', 'when', 'is', 'in', 'suspend', 'companion',
  'by', 'lazy', 'enum', 'interface', 'this', 'it'
].join('|');

const TOKEN_RE = new RegExp(
  '("(?:[^"\\\\]|\\\\.)*")' +   // 1 字串
  '|(//.*$)' +                  // 2 行註解
  '|(@\\w+)' +                  // 3 註解標記
  '|\\b(\\d+)\\b' +             // 4 數字
  '|\\b(' + KEYWORDS + ')\\b' + // 5 關鍵字
  '|([A-Za-z_]\\w*)(?=\\()' +   // 6 函式呼叫
  '|\\b([A-Z][A-Za-z0-9_]*)\\b',// 7 類別／型別
  'g'
);

/**
 * 把一行程式碼切成 token。
 * @param {string} line
 * @returns {{t: string, c: string}[]} c 為 CSS class 後綴（kw / str / cm ...）
 */
export function highlightLine(line) {
  const trimmed = line.trim();

  // 整行註解（含 KDoc）直接整行上色
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
    return [{ t: line, c: 'cm' }];
  }
  if (!line.length) return [{ t: ' ', c: 'def' }];

  const out = [];
  let last = 0;
  let m;

  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(line)) !== null) {
    if (m.index > last) out.push({ t: line.slice(last, m.index), c: 'def' });
    const c = m[1] ? 'str'
      : m[2] ? 'cm'
      : m[3] ? 'an'
      : m[4] ? 'num'
      : m[5] ? 'kw'
      : m[6] ? 'fn'
      : 'ty';
    out.push({ t: m[0], c });
    last = m.index + m[0].length;
  }

  if (last < line.length) out.push({ t: line.slice(last), c: 'def' });
  return out.length ? out : [{ t: line, c: 'def' }];
}

/**
 * 把整份程式碼切成行。
 * @param {string} code
 * @returns {{n: number, tokens: {t: string, c: string}[]}[]}
 */
export function highlightCode(code) {
  return code.split('\n').map((line, i) => ({ n: i + 1, tokens: highlightLine(line) }));
}
