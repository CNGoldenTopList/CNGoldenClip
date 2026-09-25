import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareIntake } from '../src/intake.mjs';
import { makeClient, startAuthorization, TOKEN_KEY } from '../src/transport.mjs';

const origin = 'https://cngist.com';
const credential = { token: `cngclip_${'a'.repeat(43)}`, expiresAt: new Date(Date.now() + 86400000).toISOString() };
const button = () => ({ disabled: false, textContent: '添加到金榜', title: '', attributes: new Map(),
  setAttribute(k, v) { this.attributes.set(k, v); }, removeAttribute(k) { this.attributes.delete(k); } });

test('每次点击都向后端验证；loading 禁止重复点击，成功和失败都恢复按钮', async () => {
  const b = button(); let checks = 0, loads = 0, complete;
  const client = { request: async () => { checks++; await new Promise(resolve => { complete = resolve; }); }, open() { throw new Error('不应打开授权页'); } };
  const loading = prepareIntake(client, b, async () => { loads++; });
  assert.equal(b.disabled, true); assert.equal(b.attributes.get('aria-busy'), 'true'); assert.match(b.textContent, /验证/);
  assert.equal(await prepareIntake(client, b, async () => {}), false); assert.equal(checks, 1);
  complete(); assert.equal(await loading, true); assert.equal(loads, 1); assert.equal(b.disabled, false); assert.equal(b.textContent, '添加到金榜');
  const again = prepareIntake(client, b, async () => { throw new Error('网络错误'); }); complete();
  assert.equal(await again, false); assert.equal(checks, 2); assert.equal(b.disabled, false); assert.equal(b.title, '网络错误');
  const retry = prepareIntake(client, b, async () => {}); complete();
  assert.equal(await retry, true); assert.equal(b.textContent, '添加到金榜');
});

test('缺失、过期和被撤销的凭据自动打开授权页；网络异常不冒充授权失效', async () => {
  for (const scenario of ['missing', 'expired', 'revoked', 'network', 'valid']) {
    let saved = scenario === 'missing' ? undefined : { ...credential, expiresAt: scenario === 'expired' ? '2020-01-01' : credential.expiresAt };
    let opens = 0, checks = 0, loads = 0;
    const client = makeClient({ getValue: () => saved, deleteValue: () => { saved = undefined; },
      openInTab: url => { assert.equal(url, `${origin}/admin/submission_token`); opens++; },
      xmlhttpRequest: options => {
        checks++; assert.equal(options.url, `${origin}/api/clip/authorization`); assert.equal(options.anonymous, true);
        assert.equal(options.headers.Authorization, `Bearer ${credential.token}`);
        if (scenario === 'network') options.onerror();
        else options.onload({ status: scenario === 'revoked' ? 401 : 200, responseText: JSON.stringify({ ok: scenario !== 'revoked' }) });
      },
    }, origin);
    const b = button();
    assert.equal(await prepareIntake(client, b, async () => { loads++; }), scenario === 'valid');
    assert.equal(opens, ['missing', 'expired', 'revoked'].includes(scenario) ? 1 : 0);
    assert.equal(checks, ['missing', 'expired'].includes(scenario) ? 0 : 1);
    assert.equal(loads, scenario === 'valid' ? 1 : 0); assert.equal(b.disabled, false);
  }
});

test('授权页进入不签发，只有真实点击一键授权才同源申请并写入 GM，重复点击不会重复签发', async () => {
  const old = { location: globalThis.location, document: globalThis.document, window: globalThis.window };
  const attributes = new Map(), storage = new Map(); let click, issued = 0, complete;
  globalThis.location = new URL(`${origin}/admin/submission_token`);
  globalThis.document = { documentElement: { setAttribute: (k,v) => attributes.set(k,v) }, addEventListener: (_,fn) => { click = fn; } };
  globalThis.window = { dispatchEvent() {} };
  const gm = { getValue: key => storage.get(key), setValue: (key,v) => storage.set(key,v) };
  try {
    startAuthorization(gm, origin, async (url, options) => {
      issued++; assert.equal(url, `${origin}/api/admin/submission-token`); assert.equal(options.method, 'POST'); assert.equal(options.credentials, 'same-origin');
      await new Promise(resolve => { complete = resolve; }); return { ok: true, json: async () => ({ ok: true, ...credential }) };
    });
    assert.equal(issued, 0); assert.equal(storage.size, 0);
    const event = { isTrusted: false, target: { closest: selector => selector === 'button[data-cngoldenclip-authorize]' ? {} : null } };
    await click(event); assert.equal(issued, 0);
    const work = click({ ...event, isTrusted: true });
    assert.equal(attributes.get('data-cngoldenclip-auth-state'), 'pending');
    await click({ ...event, isTrusted: true }); assert.equal(issued, 1);
    complete(); await work; assert.deepEqual(storage.get(TOKEN_KEY), credential);
    assert.equal(attributes.get('data-cngoldenclip-auth-state'), 'success');
    assert.equal([...attributes.values()].some(v => v.includes(credential.token)), false);
    globalThis.location = new URL(`${origin}/account`); await click({ ...event, isTrusted: true }); assert.equal(issued, 1);
  } finally { Object.assign(globalThis, old); }
});
