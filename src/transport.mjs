const prefix = 'cngist-intake-v1:';
export const keyOf = (channel, part) => `${prefix}${channel}:${part}`;

export function makeClient(gm, origin) {
  let channel = '', queue = Promise.resolve();
  const listeners = new Set();
  const ready = new Promise(resolve => gm.getTab(tab => {
    channel = tab.cngistIntakeChannel ||= crypto.randomUUID();
    gm.saveTab(tab); resolve();
  }));
  async function send(action, payload = {}) {
    await ready;
    if (!gm.getValue(keyOf(channel, 'enabled'))) throw new Error('请先点“连接金榜”，在打开的页面登录管理员。');
    const id = crypto.randomUUID();
    const requestKey = keyOf(channel, 'request'), responseKey = keyOf(channel, 'response');
    return new Promise((resolve, reject) => {
      let finished = false;
      const check = () => {
        const reply = gm.getValue(responseKey);
        if (reply?.id !== id || finished) return;
        finish(); gm.deleteValue(responseKey);
        if (reply.ok) resolve(reply.data);
        else reject(new Error(reply.error || '金榜请求失败。'));
      };
      const listener = gm.addValueChangeListener(responseKey, check);
      const poll = setInterval(check, 500);
      const timeout = setTimeout(() => {
        finish();
        if (gm.getValue(requestKey)?.id === id) gm.deleteValue(requestKey);
        reject(new Error(action === 'submit' ? '未收到保存结果，请先刷新重复检查或到后台核对，勿直接重复提交。' : '金榜连接未响应，请打开连接页，登录后再点“载入金榜”。'));
      }, action === 'ping' ? 4000 : 35000);
      function finish() { finished = true; clearInterval(poll); clearTimeout(timeout); gm.removeValueChangeListener(listener); listeners.delete(finish); }
      listeners.add(finish);
      gm.setValue(requestKey, { id, action, payload, at: Date.now() });
      check();
    });
  }
  return {
    async open() {
      await ready;
      gm.setValue(keyOf(channel, 'enabled'), true);
      // 新连接页替代旧连接页；只有最新 owner 可以消费请求。
      const owner = crypto.randomUUID(); gm.setValue(keyOf(channel, 'owner'), owner);
      gm.openInTab(`${origin}/account#cngist-intake=${channel}&owner=${owner}`, { active: true, insert: true, setParent: true });
    },
    request(action, payload) {
      const next = queue.then(() => send(action, payload));
      queue = next.catch(() => {}); return next;
    },
  };
}

export async function startBridge(gm, origin, notice, fetcher = fetch) {
  const hash = new URLSearchParams(location.hash.slice(1));
  const tab = await new Promise(resolve => gm.getTab(resolve));
  if (hash.has('cngist-intake')) {
    tab.cngistBridge = { channel: hash.get('cngist-intake'), owner: hash.get('owner') }; gm.saveTab(tab);
  }
  const { channel, owner } = tab.cngistBridge || {};
  if (!channel || !owner || !/^[\da-f-]{36}$/.test(channel) || !gm.getValue(keyOf(channel, 'enabled'))) return;
  const active = () => gm.getValue(keyOf(channel, 'owner')) === owner;
  if (!active()) return;
  notice('金榜补录连接页：保持此页打开，登录管理员后回到 B 站点“载入金榜”。');
  async function api(path, body) {
    const response = await fetcher(`${origin}${path}`, { credentials: 'same-origin', cache: 'no-store',
      signal: AbortSignal.timeout(25000), ...(body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok === false || !data) throw new Error(data?.error || `请求失败（${response.status}）`);
    return data;
  }
  let queue = Promise.resolve();
  const requestKey = keyOf(channel, 'request');
  const consume = () => {
    const req = gm.getValue(requestKey);
    if (!active() || !req || typeof req.id !== 'string' || Date.now() - req.at > 35000) return;
    // 先消费，再请求。不持久化可自动重放的写队列；连接页刷新也不会重复提交。
    gm.deleteValue(requestKey);
    queue = queue.then(async () => {
      if (!active()) return;
      try {
        const session = await api('/api/auth/session');
        if (!['admin', 'super_admin'].includes(session.account?.role)) throw new Error('请在金榜连接页登录管理员账号。');
        let data;
        if (req.action === 'ping') data = { name: session.account.displayName };
        else if (req.action === 'catalog') {
          const catalog = await api('/api/catalog');
          data = { players: catalog.players, campaigns: catalog.campaigns, maps: catalog.maps,
            challenges: catalog.challenges, multiMapChallenges: catalog.multiMapChallenges, adminName: session.account.displayName };
        } else if (req.action === 'records') {
          const id = req.payload?.playerId;
          if (!Number.isSafeInteger(id) || id < 1) throw new Error('玩家编号无效。');
          const results = await Promise.allSettled([api(`/api/records?playerId=${id}`), api('/api/admin/submissions')]);
          data = { publicRecords: [], adminRecords: [], warnings: [] };
          if (results[0].status === 'fulfilled' && Array.isArray(results[0].value.records)) data.publicRecords = results[0].value.records;
          else data.warnings.push('已有成绩读取失败');
          if (results[1].status === 'fulfilled' && Array.isArray(results[1].value.data)) data.adminRecords = results[1].value.data.filter(r => r.playerId === id);
          else data.warnings.push('待审核记录读取失败');
        } else if (req.action === 'submit') {
          const body = req.payload;
          if (!body || !Number.isSafeInteger(body.playerId) || !Number.isSafeInteger(body.challengeId)
            || !['pending', 'rejected'].includes(body.status)) throw new Error('补录参数无效。');
          data = await api('/api/admin/submissions', { playerId: body.playerId, challengeId: body.challengeId,
            status: body.status, videoUrl: body.videoUrl, achievedAt: body.achievedAt,
            rawVideoUrl: body.rawVideoUrl || '', playerNote: body.playerNote || '' });
          if (!data.record?.id) throw new Error('响应未包含记录编号，请到后台核对保存结果。');
        } else throw new Error('未知操作。');
        gm.setValue(keyOf(channel, 'response'), { id: req.id, ok: true, data });
        notice(`已连接：${session.account.displayName}。请保持此页打开，在 B 站完成录入。`);
      } catch (error) {
        gm.setValue(keyOf(channel, 'response'), { id: req.id, ok: false, error: req.action === 'submit'
          ? `${error.message} 如请求已发出，请先刷新重复检查或到后台核对。` : error.message });
        notice(error.message);
      }
    }).catch(error => notice(error.message));
  };
  gm.addValueChangeListener(requestKey, consume);
  consume();
}
