/**
 * 進入點：接起 Model → ViewModel → View。
 */

import { SiteModel } from './model.js';
import { IdeViewModel } from './viewmodel.js';
import { IdeView } from './view.js';

const root = document.getElementById('app');

boot();

async function boot() {
  showLoading();

  let model;
  try {
    model = await SiteModel.load();
  } catch (err) {
    showError(err);
    return;
  }

  const vm = new IdeViewModel(model);
  const view = new IdeView(root, vm);
  view.render();

  // 後台 /admin/ 的即時預覽：只在 ?preview=1 時開啟訊息通道
  if (new URLSearchParams(location.search).get('preview') === '1') {
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin) return;
      const msg = e.data;
      if (!msg || msg.type !== 'andyawd:preview') return;
      vm.replaceData({ content: msg.content, ui: msg.ui });
    });
    window.parent?.postMessage({ type: 'andyawd:preview-ready' }, location.origin);
  }
}

function showLoading() {
  root.className = 'ide';
  root.innerHTML = `
    <div class="build" style="height:100%;border-top:0">
      <div class="build__header"><span class="build__tab--active">Build</span></div>
      <div class="build__body">
        <div class="build__row">
          <span class="build__time">--:--:--</span>
          <span class="build__text build__text--muted">&gt; Task :androidWebsite:compileKotlin</span>
        </div>
      </div>
    </div>`;
}

function showError(err) {
  console.error(err);
  root.className = 'ide';
  root.innerHTML = `
    <div class="build" style="height:100%;border-top:0">
      <div class="build__header"><span class="build__tab--active">Build</span></div>
      <div class="build__body">
        <div class="build__row">
          <span class="build__time">--:--:--</span>
          <span class="build__text build__text--error">BUILD FAILED — 無法載入網站資料，請重新整理。</span>
        </div>
        <div class="build__row">
          <span class="build__time"></span>
          <span class="build__text build__text--dim">${escapeHtml(String(err.message || err))}</span>
        </div>
      </div>
    </div>`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
