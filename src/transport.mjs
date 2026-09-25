export const TOKEN_KEY = 'cngoldenclip:submission-token:v1';
const authorizationError = message => Object.assign(new Error(message), { code: 'authorization_required' });

/** 只有授权页真实点击才签发；凭据直接从同源响应写入脚本存储，不经过网页 DOM。 */
export function startAuthorization(gm, origin, fetcher = fetch) {
  if (location.origin !== origin) return;
  const root = document.documentElement;
  root.setAttribute('data-cngoldenclip-ready', '2');
  let busy = false;
  const status = (state, error = '') => {
    root.setAttribute('data-cngoldenclip-auth-state', state);
    root.setAttribute('data-cngoldenclip-auth-error', error);
    window.dispatchEvent(new Event('cngoldenclip-auth-state'));
  };
  document.addEventListener('click', async event => {
    if (!event.isTrusted || location.pathname !== '/admin/submission_token') return;
    if (!event.target.closest?.('button[data-cngoldenclip-authorize]') || busy) return;
    busy = true; status('pending');
    try {
      const response = await fetcher(`${origin}/api/admin/submission-token`, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(25000),
      });
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.error || '授权失败，请重试。');
      if (!/^cngclip_[A-Za-z0-9_-]{43}$/.test(data.token || '') || !(Date.parse(data.expiresAt) > Date.now())) throw new Error('授权响应无效，请重试。');
      const saved = { token: data.token, expiresAt: data.expiresAt };
      gm.setValue(TOKEN_KEY, saved);
      if (gm.getValue(TOKEN_KEY)?.token !== saved.token) throw new Error('写入油猴存储失败，请检查脚本权限。');
      status('success');
    } catch (error) { status('error', error.message || '授权失败，请重试。'); }
    finally { busy = false; }
  }, true);
}

export function makeClient(gm, origin) {
  const authorization = () => {
    const saved = gm.getValue(TOKEN_KEY);
    if (!saved || !/^cngclip_[A-Za-z0-9_-]{43}$/.test(saved.token || '') || !(Date.parse(saved.expiresAt) > Date.now())) {
      throw authorizationError('尚未授权，请到金榜点击“一键授权”。');
    }
    return saved;
  };
  function api(path, body, token) {
    return new Promise((resolve, reject) => {
      const uncertain = '保存结果不确定，请先刷新重复检查或到金榜后台核对，勿直接重复提交。';
      let finished = false, request;
      const finish = (error, data) => { if (finished) return; finished = true; clearTimeout(timer); error ? reject(error) : resolve(data); };
      const fail = () => finish(new Error(body ? uncertain : '记录或目录读取失败，请重试。'));
      // anonymous/redirect 在部分油猴版本使用 fetch，不能依赖扩展的 timeout。
      const timer = setTimeout(() => { fail(); request?.abort?.(); }, 25000);
      try { request = gm.xmlhttpRequest({ method: body ? 'POST' : 'GET', url: `${origin}${path}`,
        anonymous: true, redirect: 'error', timeout: 25000,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body ? { data: JSON.stringify(body) } : {}),
        onload(response) {
          if (finished) return;
          let data;
          try { data = JSON.parse(response.responseText); } catch { fail(); return; }
          if (response.status < 200 || response.status >= 300 || !data || data.ok === false) {
            // 不清掉其他标签页刚安装的新授权。
            if (response.status === 401 && token && gm.getValue(TOKEN_KEY)?.token === token) gm.deleteValue(TOKEN_KEY);
            const message = response.status >= 500 && body ? uncertain : data?.error || `请求失败（${response.status}）`;
            finish(response.status === 401 && token ? authorizationError(message) : new Error(message)); return;
          }
          if (body && !data.record?.id) { fail(); return; }
          finish(null, data);
        }, onerror: fail, ontimeout: fail, onabort: fail,
      }); } catch { fail(); }
    });
  }
  return {
    async open() { gm.openInTab(`${origin}/admin/submission_token`, { active: true, insert: true, setParent: true }); },
    hasAuthorization() { try { authorization(); return true; } catch { return false; } },
    async request(action, payload = {}) {
      if (action === 'verify') {
        const data = await api('/api/clip/authorization', undefined, authorization().token);
        if (data.ok !== true) throw new Error('授权验证响应无效，请稍后重试。');
        return data;
      }
      if (action === 'catalog') return api('/api/catalog');
      if (action === 'records') {
        if (!Number.isSafeInteger(payload.playerId) || payload.playerId < 1) throw new Error('玩家编号无效。');
        const results = await Promise.allSettled([
          api(`/api/records?playerId=${payload.playerId}`),
          Promise.resolve().then(() => api(`/api/clip/submissions?playerId=${payload.playerId}`, undefined, authorization().token)),
        ]);
        const data = { publicRecords: [], adminRecords: [], warnings: [] };
        if (results[0].status === 'fulfilled' && Array.isArray(results[0].value.records)) data.publicRecords = results[0].value.records;
        else data.warnings.push('已有成绩读取失败');
        if (results[1].status === 'fulfilled' && Array.isArray(results[1].value.data)) data.adminRecords = results[1].value.data.filter(r => r.playerId === payload.playerId);
        else data.warnings.push(results[1].status === 'rejected' ? `待审核记录读取失败：${results[1].reason.message}` : '待审核记录读取失败');
        return data;
      }
      if (action === 'submit') {
        const { token } = authorization();
        const { playerId, challengeId, videoUrl, achievedAt, rawVideoUrl = '', playerNote = '' } = payload;
        return api('/api/clip/submissions', { playerId, challengeId, videoUrl, achievedAt, rawVideoUrl, playerNote }, token);
      }
      throw new Error('未知操作。');
    },
  };
}
