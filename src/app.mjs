import { readCard, dateFromVideoDocument, videoRef, playerUids, mergeRecords, duplicates, submissionBody, statusNames } from './core.mjs';
import { makeClient, startBridge } from './transport.mjs';
import { isRatedTier, tierBadgeLabel } from './vendor/tiers.ts';

const css = `
:host{font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif;color:#e4e7ed;color-scheme:dark}
*{box-sizing:border-box}button,input,textarea{font:inherit}button,a{touch-action:manipulation}
button{border:1px solid #414852;background:#252c37;color:#e4e7ed;border-radius:6px;padding:6px 10px;cursor:pointer}
button:hover{background:#343f50}button:disabled{opacity:.5;cursor:default}button.primary{background:#276cc8;border-color:#488ced;color:white}
button:focus-visible,a:focus-visible{outline:2px solid #75b5ff;outline-offset:2px}a{color:#85b8ff;text-decoration:none}
.toolbar{position:fixed;right:24px;bottom:24px;z-index:2147483645;padding:10px 12px;background:#181e28;border:1px solid #414852;border-radius:10px;box-shadow:0 4px 20px #0005;display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:calc(100vw - 32px)}
.brand{color:#e9c474;font-weight:650}.muted,.hint{font-size:12px;color:#aab4c4}.error{color:#ffaaaa}.warning{color:#efd18d}
dialog{color:inherit;background:#181e28;border:1px solid #495365;border-radius:12px;padding:0;width:660px;max-width:calc(100vw - 28px);max-height:90vh;box-shadow:0 12px 60px #0008}
dialog::backdrop{background:#0008}.panel{padding:20px;display:grid;gap:14px}.head{display:flex;gap:14px;align-items:start;justify-content:space-between}.head h2{font-size:18px;margin:0}.video{font-size:14px;margin:4px 0;overflow-wrap:anywhere}
label{display:grid;align-content:start;gap:5px;font-size:13px}input,textarea{width:100%;background:#10151e;color:#edf1f8;border:1px solid #495365;border-radius:6px;padding:8px 10px;outline:none}input:focus,textarea:focus{border-color:#76b3ff}textarea{resize:vertical}
.grid{align-items:start}.grid>label{min-width:0}.grid input{height:40px;min-height:40px;line-height:22px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.picker{position:relative}.results{display:grid;gap:2px;margin-top:4px;max-height:180px;overflow:auto;border:1px solid #414852;border-radius:6px;background:#111822;padding:4px}.results[hidden]{display:none}.results button{text-align:left;border:0;background:transparent;border-radius:3px;padding:7px 9px}.results button:hover,.results button.active{background:#263d5c}
.selected{font-size:12px;color:#91c7ff;overflow-wrap:anywhere;margin-top:4px;min-height:18px}.dup{font-size:12px;display:flex;gap:6px;align-items:baseline;flex-wrap:wrap;min-height:23px}.dup button{font-size:12px;padding:1px 6px}.records{padding:8px 10px;background:#111822;border-radius:6px;display:grid;gap:6px;font-size:12px;max-height:140px;overflow:auto}.records[hidden]{display:none}.records div{display:flex;gap:10px;flex-wrap:wrap}
.footer{display:flex;gap:10px;align-items:center;justify-content:space-between;border-top:1px solid #353e4a;padding-top:14px}.footer .hint{flex:1}.extra{font-size:13px}.extra summary{cursor:pointer;color:#aab4c4}.extra label{margin-top:10px}.notice{position:fixed;bottom:20px;left:20px;right:20px;z-index:2147483647;padding:13px 16px;background:#192539;border:1px solid #668dc2;border-radius:8px}
@media(max-width:520px){.grid{grid-template-columns:1fr}.panel{padding:14px}.toolbar{right:12px;bottom:12px}.footer{flex-wrap:wrap}}
`;
function el(tag, text, props = {}) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; Object.assign(node, props); return node; }
function link(label, url) {
  const a = el('a', label, { target: '_blank', rel: 'noopener noreferrer' });
  try { const parsed = new URL(url); if (/^https?:$/.test(parsed.protocol)) a.href = parsed.href; } catch { /* no link */ }
  return a;
}
function mount() {
  const host = el('div'); host.setAttribute('data-cngist-ui', '');
  const root = host.attachShadow({ mode: 'open' }); root.append(el('style', css)); document.body.append(host); return root;
}
export function loadVideoDate(gm, video) {
  return new Promise((resolve, reject) => gm.xmlhttpRequest({ method: 'GET', url: video.url, timeout: 15000,
    onload: response => {
      if (response.status !== 200 || (response.finalUrl && videoRef(response.finalUrl)?.bv !== video.bv)) return reject(new Error('视频页面暂不可读'));
      const date = dateFromVideoDocument(new DOMParser().parseFromString(response.responseText, 'text/html'), video.bv);
      date ? resolve(date) : reject(new Error('页面没有可识别的发布日期'));
    }, onerror: () => reject(new Error('视频页面请求失败')), ontimeout: () => reject(new Error('视频页面请求超时')),
  }));
}

export async function start({ gm, origin = 'https://cngist.com', role, searchable, challengeName, videoLoader = loadVideoDate }) {
  if (role === 'bridge') {
    let notice;
    await startBridge(gm, origin, text => {
      if (!notice) { notice = el('div', '', { className: 'notice', role: 'status' }); mount().append(notice); }
      notice.textContent = text;
    });
    return;
  }
  if (role !== 'search') return;
  const root = mount(), client = makeClient(gm, origin);
  let catalog, catalogPromise, choices = [], activeDialog, saving = false, added = 0;
  const recordsByPlayer = new Map(), savedVideos = new Map(), dateCache = new Map();
  const toolbar = el('div', undefined, { className: 'toolbar' });
  const state = el('span', '先连接管理员账号', { className: 'muted', role: 'status' });
  const count = el('span', '', { className: 'muted' });
  const connect = el('button', '连接金榜', { type: 'button' });
  const reload = el('button', '载入金榜', { type: 'button' });
  const review = link('去审核', `${origin}/admin?tab=pending`);
  toolbar.append(el('span', 'CN 金榜', { className: 'brand' }), state, connect, reload, count, review); root.append(toolbar);
  connect.onclick = () => client.open().catch(error => { state.textContent = error.message; });
  reload.onclick = () => loadCatalog(true).catch(error => { state.textContent = error.message; });
  gm.registerMenuCommand('连接 CN 金榜管理员', () => connect.click());

  async function loadCatalog(force = false) {
    if (catalogPromise) return catalogPromise;
    if (catalog && !force) return catalog;
    reload.disabled = true; state.textContent = '正在载入…';
    catalogPromise = client.request('catalog').then(data => {
      for (const name of ['players', 'campaigns', 'maps', 'challenges', 'multiMapChallenges']) if (!Array.isArray(data[name])) throw new Error('金榜目录格式不匹配，请刷新连接页。');
      catalog = data;
      const packs = new Map(data.campaigns.map(p => [p.id, p]));
      const maps = new Map(data.maps.map(m => [m.id, m]));
      const names = value => [value?.name, value?.cnName].filter(Boolean).join(' · ');
      choices = [...data.challenges, ...data.multiMapChallenges].map(c => {
        const map = maps.get(c.mapId), pack = packs.get(c.campaignId || map?.campaignId);
        const tier = isRatedTier(c.tier) ? tierBadgeLabel(c.tier).replace(/Tier /, 'T') : '未定档';
        return { ...c, label: [names(pack), map && names(map), challengeName(c), tier].filter(Boolean).join(' / '),
          search: [pack?.name, pack?.cnName, pack?.shortName, map?.name, map?.cnName, c.name, c.type, tier],
          aliases: [...(pack?.searchAliases || []), ...(map?.searchAliases || [])], mapNames: [map?.name, map?.cnName].filter(Boolean) };
      });
      state.textContent = `已连接 · ${data.adminName}`; return catalog;
    }).catch(error => { state.textContent = error.message; throw error; })
      .finally(() => { catalogPromise = null; reload.disabled = false; });
    return catalogPromise;
  }

  function picker(labelText, placeholder, options, matches, name, onSelect) {
    const wrap = el('div', undefined, { className: 'picker' });
    const label = el('label', labelText), input = el('input', undefined, { placeholder, type: 'search', autocomplete: 'off' });
    const list = el('div', undefined, { className: 'results', hidden: true });
    const selected = el('div', '', { className: 'selected' });
    label.append(input); wrap.append(label, list, selected);
    let value = null, cursor = -1, shown = [];
    const choose = item => { value = item; input.value = name(item); selected.textContent = name(item); list.hidden = true; onSelect(item); };
    function render() {
      shown = options().filter(item => matches(item, input.value.trim())).slice(0, 40);
      cursor = -1; list.replaceChildren(); list.hidden = false;
      for (const item of shown) {
        const button = el('button', name(item), { type: 'button' });
        button.onmousedown = event => event.preventDefault();
        button.onclick = () => choose(item); list.append(button);
      }
      if (!shown.length) list.append(el('span', '没有匹配项，请更换关键词。', { className: 'hint' }));
    }
    input.oninput = () => { value = null; selected.textContent = ''; onSelect(null); render(); };
    input.onfocus = () => { if (!value) render(); };
    input.onblur = () => { setTimeout(() => { list.hidden = true; }, 150); };
    input.onkeydown = event => {
      if (event.key === 'Escape' && !list.hidden) { event.preventDefault(); event.stopPropagation(); list.hidden = true; }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault(); if (list.hidden) render();
        cursor = Math.max(0, Math.min(shown.length - 1, cursor + (event.key === 'ArrowDown' ? 1 : -1)));
        [...list.children].forEach((b, i) => b.classList.toggle('active', i === cursor)); list.children[cursor]?.scrollIntoView({ block: 'nearest' });
      }
      if (event.key === 'Enter') { event.preventDefault(); if (!list.hidden && shown.length) choose(shown[Math.max(0, cursor)]); }
    };
    return { wrap, input, selected, choose, get value() { return value; } };
  }

  async function openForm(video, button) {
    if (saving) return;
    button.disabled = true;
    try { await loadCatalog(); } catch (error) { state.textContent = `${error.message} 先点“连接金榜”。`; return; }
    finally { button.disabled = false; }
    activeDialog?.close(); activeDialog?.remove();
    const dialog = activeDialog = el('dialog');
    const panel = el('div', undefined, { className: 'panel' }); dialog.append(panel); root.append(dialog);
    const close = el('button', '关闭', { type: 'button', ariaLabel: '关闭录入表单' });
    close.onclick = () => { if (!saving) dialog.close(); };
    dialog.oncancel = event => { if (saving) event.preventDefault(); };
    dialog.onclose = () => { dialog.remove(); if (activeDialog === dialog) activeDialog = null; };
    const head = el('div', undefined, { className: 'head' }), heading = el('div');
    heading.append(el('h2', '添加挑战记录'), link(video.title, video.url), el('div', `UP 主：${video.author} · UID ${video.uid || '未识别'}`, { className: 'hint' }));
    head.append(heading, close); panel.append(head);
    let checkVersion = 0, loadingRecords = false, recordWarning = '', currentRecords = [];
    const duplicateLine = el('div', undefined, { className: 'dup', role: 'status' });
    const duplicateText = el('span'), showRecords = el('button', '查看记录', { type: 'button', hidden: true });
    const refresh = el('button', '刷新检查', { type: 'button' });
    duplicateLine.append(duplicateText, showRecords, refresh);
    const recordList = el('div', undefined, { className: 'records', hidden: true });
    const result = el('div', '', { className: 'hint', role: 'status' });
    const submit = el('button', '加入待审核', { className: 'primary', type: 'button' });
    const policy = el('span', '', { className: 'hint' });
    const playerPicker = picker('金榜玩家', '搜索名字或 B 站 UID', () => catalog.players,
      (p, q) => searchable([p.name, ...playerUids(p)], p.aliases, q),
      p => `${p.name} · UID ${playerUids(p).join(' / ') || '未登记'}`, () => { void refreshRecords(); update(); });
    const queryTitle = video.title.toLowerCase();
    const orderedChoices = [...choices].sort((a, b) => Number(b.mapNames.some(n => n.length > 2 && queryTitle.includes(n.toLowerCase()))) - Number(a.mapNames.some(n => n.length > 2 && queryTitle.includes(n.toLowerCase()))));
    const challengePicker = picker('已有挑战', '搜索地图包、地图、挑战；支持中文 / 拼音 / 英文', () => orderedChoices,
      (c, q) => q.split(/\s+/).every(part => searchable(c.search, c.aliases, part)), c => c.label, () => update());
    panel.append(playerPicker.wrap, challengePicker.wrap, duplicateLine, recordList);
    const grid = el('div', undefined, { className: 'grid' });
    const dateLabel = el('label', '达成日期（默认视频发布日期）'), date = el('input', undefined, { type: 'date', value: video.date || '' });
    const dateHint = el('span', video.date ? '已从搜索卡片读取发布日期，可修改。' : '正在读取准确发布日期…', { className: 'hint' });
    dateLabel.append(date, dateHint);
    const urlLabel = el('label', '挑战视频链接'), url = el('input', undefined, { type: 'url', value: video.url }); urlLabel.append(url);
    grid.append(dateLabel, urlLabel); panel.append(grid);
    const extra = el('details', undefined, { className: 'extra' }); extra.append(el('summary', 'RAW 链接与备注（可选）'));
    const rawLabel = el('label', 'RAW 视频链接'), raw = el('input', undefined, { type: 'url', placeholder: 'https://' }); rawLabel.append(raw);
    const noteLabel = el('label', '玩家备注'), note = el('textarea', undefined, { rows: 2, maxLength: 4000 }); noteLabel.append(note); extra.append(rawLabel, noteLabel); panel.append(extra, result);
    const footer = el('div', undefined, { className: 'footer' }); footer.append(policy, submit); panel.append(footer);
    let dateEdited = false;
    date.oninput = () => { dateEdited = true; };
    url.oninput = update;

    function update() {
      const player = playerPicker.value, goal = challengePicker.value;
      submit.disabled = saving || !player || !goal;
      const standard = ['high-std', 'mid-std', 'low-std'].includes(goal?.tier);
      const rejected = ['unwilling', 'blocked'].includes(player?.status);
      submit.textContent = rejected ? '按玩家状态保存' : standard ? '添加记录（Standard）' : '加入待审核';
      policy.textContent = rejected ? '该玩家不接受入榜，沿用后台规则保存为已拒绝。' : standard ? 'Standard 按现有规则自动通过。' : '保存后进入待审核队列，稍后统一审核。';
      const found = player && goal ? duplicates(currentRecords, player.id, goal.id, url.value) : [];
      duplicateText.className = found.length || recordWarning ? 'warning' : 'muted';
      if (!player || !goal) duplicateText.textContent = '选好玩家和挑战后显示重复提醒。';
      else if (loadingRecords) duplicateText.textContent = '正在检查已有记录…';
      else {
        const counts = Object.entries(statusNames).map(([status, name]) => {
          const n = found.filter(r => r.status === status).length; return n ? `${name} ${n} 条` : '';
        }).filter(Boolean).join('、');
        duplicateText.textContent = `${found.length ? `已有此挑战：${counts}${found.some(r => r.sameVideo) ? '；同一视频已录入' : ''}。` : '未发现此玩家的同挑战记录。'}${recordWarning ? ` ${recordWarning}，检查不完整。` : ''}`;
        if (!found.length && recordWarning) duplicateText.textContent = `${recordWarning}，暂不能确认是否重复。`;
      }
      showRecords.hidden = !found.length;
      recordList.replaceChildren();
      for (const r of found) {
        const row = el('div'); row.append(el('span', `${statusNames[r.status] || r.status} · ${r.achievedAt || '日期未知'}${r.sameVideo ? ' · 同一视频' : ''}`), link('视频', r.videoUrl), link('金榜记录', `${origin}/record/${r.id}`)); recordList.append(row);
      }
      if (!found.length) recordList.hidden = true;
    }
    async function refreshRecords() {
      const version = ++checkVersion, player = playerPicker.value;
      currentRecords = player ? recordsByPlayer.get(player.id)?.records || [] : [];
      recordWarning = ''; loadingRecords = Boolean(player); refresh.disabled = Boolean(player); update();
      if (!player) { refresh.disabled = false; return; }
      try {
        const data = await client.request('records', { playerId: player.id });
        const records = mergeRecords(data.publicRecords, data.adminRecords);
        recordsByPlayer.set(player.id, { records });
        if (version !== checkVersion || !dialog.isConnected) return;
        currentRecords = records; recordWarning = data.warnings.join('；');
      } catch (error) { if (version === checkVersion) recordWarning = error.message; }
      finally { if (version === checkVersion) { loadingRecords = false; refresh.disabled = false; update(); } }
    }
    refresh.onclick = () => void refreshRecords();
    showRecords.onclick = () => { recordList.hidden = !recordList.hidden; };
    submit.onclick = async () => {
      if (saving) return;
      let body;
      try { body = submissionBody({ player: playerPicker.value, challenge: challengePicker.value,
        videoUrl: url.value, achievedAt: date.value, rawVideoUrl: raw.value.trim(), playerNote: note.value }); }
      catch (error) { result.textContent = error.message; result.className = 'error'; return; }
      saving = true; update(); close.disabled = true; result.className = 'hint'; result.textContent = '正在保存…';
      // 保存期间锁住整张表单，保证确认内容与实际请求一致。
      const fields = [...panel.querySelectorAll('input,textarea,button')]; fields.forEach(f => { f.disabled = true; });
      try {
        const response = await client.request('submit', body);
        const record = response.record;
        currentRecords = mergeRecords(currentRecords, [record]); recordsByPlayer.set(body.playerId, { records: currentRecords });
        savedVideos.set(video.key, `${statusNames[record.status] || '已保存'}`); added++; count.textContent = `本次已添加 ${added} 条`;
        button.textContent = savedVideos.get(video.key); state.textContent = `已保存 · ${statusNames[record.status] || record.status}`;
        dialog.close(); scan();
      } catch (error) {
        result.textContent = error.message; result.className = 'error';
        void refreshRecords();
      } finally {
        saving = false; fields.forEach(f => { f.disabled = false; }); close.disabled = false; update();
      }
    };
    dialog.showModal();
    const matched = catalog.players.filter(p => playerUids(p).includes(video.uid));
    if (matched.length === 1) { playerPicker.choose(matched[0]); challengePicker.input.focus(); }
    else {
      playerPicker.selected.textContent = matched.length > 1 ? '该 UID 对应多个档案，请管理员核对选择。' : '未找到该 UID 对应的金榜玩家，请核对或先在金榜建档。';
      playerPicker.selected.className = 'selected warning'; playerPicker.input.focus();
    }
    update();
    if (!video.date) {
      if (!dateCache.has(video.bv)) dateCache.set(video.bv, videoLoader(gm, video).catch(error => { dateCache.delete(video.bv); throw error; }));
      dateCache.get(video.bv).then(value => {
        if (!dialog.isConnected) return;
        if (!dateEdited) date.value = value;
        dateHint.textContent = `视频发布日期：${value}（北京时间），可修改。`;
      }).catch(() => { if (dialog.isConnected) { dateHint.textContent = '未能读取准确发布日期，请打开视频核对后填写。'; dateHint.className = 'hint warning'; } });
    }
  }
  function scan() {
    for (const card of document.querySelectorAll('.bili-video-card, .video-item')) {
      const video = readCard(card);
      if (!video) continue;
      let host = card.querySelector('[data-cngist-button]');
      if (host?.dataset.video === video.key) {
        const btn = host.shadowRoot?.querySelector('button'); if (btn) btn.textContent = savedVideos.get(video.key) || '添加到金榜';
        continue;
      }
      host?.remove(); host = el('div'); host.dataset.cngistButton = ''; host.dataset.video = video.key;
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.append(el('style', ':host{display:inline-flex;flex:0 0 auto;margin-left:auto}button{font:12px/18px system-ui;white-space:nowrap;color:#287ac7;border:1px solid #719dcc66;background:#e7f1ff;border-radius:5px;padding:2px 8px;cursor:pointer}button:disabled{opacity:.5}'));
      const button = el('button', savedVideos.get(video.key) || '添加到金榜', { type: 'button' });
      button.onclick = event => { event.preventDefault(); event.stopPropagation(); const current = readCard(card); if (current) void openForm(current, button); };
      shadow.append(button);
      const owner = card.querySelector('a[href*="space.bilibili.com/"]');
      let row = card.querySelector('.bili-video-card__info--bottom, [data-cngist-meta]');
      if (!row && owner) {
        row = el('div'); row.dataset.cngistMeta = '';
        owner.before(row); row.append(owner);
      }
      if (row) {
        Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '0' });
        if (owner && row.contains(owner)) {
          Object.assign(owner.style, { display: 'flex', alignItems: 'center', flex: '0 1 auto', minWidth: '0', overflow: 'hidden' });
          const author = owner.querySelector('.bili-video-card__info--author, .up-name');
          if (author) Object.assign(author.style, { minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
          const date = owner.querySelector('.bili-video-card__info--date');
          if (date) Object.assign(date.style, { flexShrink: '0', whiteSpace: 'nowrap' });
        }
        row.append(host);
      } else card.append(host);
    }
  }
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return; scheduled = true;
    setTimeout(() => { scheduled = false; scan(); }, 200);
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  scan();
}
