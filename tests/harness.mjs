import { start } from '../src/app.mjs';
import { searchable } from '../src/vendor/search.ts';
import { challengeDisplayName } from '../src/vendor/labels.ts';
// 仅本地测试入口提供 GM 替身；不进入发布脚本。
const callbacks = new Map(); let sequence = 0;
addEventListener('storage', event => { for (const [key, fn] of callbacks.values()) if (key === event.key) fn(); });
const gm = {
  getValue: key => JSON.parse(localStorage.getItem(key) || 'null'),
  setValue: (key, value) => localStorage.setItem(key, JSON.stringify(value)), deleteValue: key => localStorage.removeItem(key),
  addValueChangeListener(key, fn) { const id = ++sequence; callbacks.set(id, [key, fn]); return id; }, removeValueChangeListener: id => callbacks.delete(id),
  getTab: fn => fn(JSON.parse(sessionStorage.getItem('gm-tab') || '{}')),
  saveTab: value => sessionStorage.setItem('gm-tab', JSON.stringify(value)),
  openInTab: url => {
    const link = document.createElement('a'); link.href = url; link.target = '_blank';
    link.textContent = '打开模拟金榜授权页'; document.body.append(link);
  }, registerMenuCommand() {},
  xmlhttpRequest(options) {
    const controller = new AbortController();
    const url = options.url.startsWith(location.origin) ? options.url : '/fixture/video';
    fetch(url, { method: options.method, headers: options.headers, body: options.data, signal: controller.signal })
      .then(async r => options.onload({ status: r.status, responseText: await r.text(), finalUrl: options.url })).catch(options.onerror);
    return { abort: () => controller.abort() };
  },
};
import { readVideoPage } from '../src/core.mjs';
void start({ gm, origin: location.origin, role: location.pathname === '/search' ? 'search' : location.pathname.startsWith('/video/') ? 'video' : 'bridge', searchable, challengeName: challengeDisplayName,
  videoPageReader: () => readVideoPage(document, `https://www.bilibili.com${location.pathname}${location.search}`) });
