# AndyAWD 個人網站

Android Studio（Darcula）風格的靜態個人網站，架在 GitHub Pages 上。
沒有建置流程、沒有框架、沒有後端 —— 直接 commit 就上線。

## 怎麼改內容

**不要直接改 HTML。** 所有文字與結構都在 `data/` 底下的兩份 JSON：

| 檔案 | 管什麼 |
|---|---|
| `data/content.json` | 所有資料：檔案樹、每個「Kotlin 檔案」的程式碼樣板與 Preview、Build 訊息、三語字串表 |
| `data/ui.json` | 介面設定：主色、字型大小、預設主題、面板開關、預設語言與開啟的分頁、選單與狀態列文字 |

最省事的方式是開後台編輯器：

```
python -m http.server 8000       # 或任何靜態伺服器
# 瀏覽器開 http://localhost:8000/admin/
```

後台會即時預覽，改完到「輸出 JSON」按複製，貼回 `data/` 的檔案再 commit。
後台不會自己寫檔，也不存任何金鑰；它只是個表單。

> `file://` 直接開會被 CORS 擋住（`fetch` 讀不到 JSON），一定要用 http 伺服器。

## 三語是怎麼運作的

程式碼骨架只有一份，存在 `content.json` 的 `files[*].codeTemplate`，
要翻譯的地方寫成 `${key}` 佔位符：

```
val name = "${about.name}"
// ${about.comment1}
```

實際文字放在 `strings` 表，一個 key 對應三種語言：

```json
"about.name": { "zh-TW": "戴維廷 / Andy", "en": "Wei-Ting Dai / Andy", "ja": "戴維廷 / Andy" }
```

所以切語言時只有字串與註解會變，關鍵字與變數名永遠是英文。
後台的「字串表」分頁會標出缺翻譯、沒用到、以及被引用卻不存在的 key。

## 架構

MVVM，三層各自獨立：

```
js/model.js      Model      載入 JSON、決定語言、字串查表與 ${} 解析。不知道 DOM 存在。
js/viewmodel.js  ViewModel  狀態（分頁／選取檔案／主題／抽屜）+ 算出 View 要的資料。不碰 DOM。
js/view.js       View       把 view state 畫成 DOM、把事件轉成 command。不含商業邏輯。
js/highlight.js             Kotlin 語法 tokenizer，輸出 CSS class 而非 inline 顏色。
```

樣式拆成兩層：`css/tokens.css`（色彩／字型語彙，暗亮兩套）與 `css/ide.css`（版面）。
後台也 import 同一份 tokens，所以配色永遠一致。

## 字型

`assets/fonts/` 是自行託管的字型，由 `doc/tools/build-fonts.mjs` 產生：

- JetBrains Mono：Google Fonts 的 latin / latin-ext subset
- Noto Sans TC / JP：縮減成網站現有內容用到的字元，各約 120 KB

**在後台新增中日文內容後如果網站出現缺字**，重跑一次：

```
cd doc/tools
npm install subset-font
node build-fonts.mjs
```

沒涵蓋到的字會退回系統字型，不會破版，所以不重跑也不會壞。

## 其他

- 亮／暗主題：`css/tokens.css` 定義兩套變數，切換寫在 `<html data-theme>`，記在 localStorage，預設跟隨系統。
- 開啟中的分頁寫在網址 hash（`#AboutMe.kt,FastPass.kt|FastPass.kt`），可以分享特定畫面。
- 內容由 JS 渲染，所以 `index.html` 的 `<noscript>` 內放了一份純文字摘要給爬蟲與無 JS 環境。
- `/admin/` 有 `noindex`，`robots.txt` 也擋掉了。
