import { searchable } from './vendor/search.ts';
import { challengeDisplayName } from './vendor/labels.ts';
import { start } from './app.mjs';

const gm = {
  getValue: GM_getValue, setValue: GM_setValue, deleteValue: GM_deleteValue,
  addValueChangeListener: GM_addValueChangeListener, removeValueChangeListener: GM_removeValueChangeListener,
  getTab: GM_getTab, saveTab: GM_saveTab, openInTab: GM_openInTab,
  registerMenuCommand: GM_registerMenuCommand, xmlhttpRequest: GM_xmlhttpRequest,
};
void start({ gm, searchable, challengeName: challengeDisplayName,
  role: location.hostname === 'search.bilibili.com' ? 'search' : location.hostname === 'www.bilibili.com' && location.pathname.startsWith('/video/') ? 'video' : location.origin === 'https://cngist.com' ? 'bridge' : null,
}).catch(error => console.error('[CN 金榜补录]', error));
