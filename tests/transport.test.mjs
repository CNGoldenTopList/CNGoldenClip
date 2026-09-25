import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeClient, startAuthorization, TOKEN_KEY } from '../src/transport.mjs';

const origin = 'https://cngist.com';
const credential = { token: `cngclip_${'a'.repeat(43)}`, expiresAt: new Date(Date.now() + 86400000).toISOString() };
function fixture() {
  const storage = new Map(), calls = [];
  let handler = options => options.onload({ status: 200, responseText: JSON.stringify(options.url.includes('/records?') ? { records: [] } : options.method === 'POST' ? { record: { id: 1, status: 'pending' } } : options.url.includes('/clip/submissions?') ? { data: [] } : { players: [] }) });
  const gm = { getValue: key => storage.get(key), setValue: (key, value) => storage.set(key, value), deleteValue: key => storage.delete(key),
    openInTab: url => { calls.push({ opened: url }); }, xmlhttpRequest(options) { calls.push(options); handler(options); } };
  return { gm, calls, storage, client: makeClient(gm, origin), respond: fn => { handler = fn; } };
}

test('公开查询不带 token 或 Cookie；补录和重复检查使用专用授权', async () => {
  const { client, storage, calls } = fixture();
  await client.request('catalog');
  const records = await client.request('records', { playerId: 3 });
  assert.match(records.warnings[0], /待审核记录读取失败/);
  for (const options of calls) { assert.equal(options.method, 'GET'); assert.equal(options.anonymous, true); assert.equal(options.headers.Authorization, undefined); }
  await assert.rejects(client.request('submit', {}), /一键授权/);
  assert.equal(calls.length, 2);
  storage.set(TOKEN_KEY, credential);
  const checked = await client.request('records', { playerId: 3 });
  assert.deepEqual(checked.warnings, []);
  assert.equal(calls.at(-1).url, `${origin}/api/clip/submissions?playerId=3`);
  assert.equal(calls.at(-1).headers.Authorization, `Bearer ${credential.token}`);
  assert.equal(calls.at(-2).headers.Authorization, undefined);
  const result = await client.request('submit', { playerId: 3, challengeId: 4, videoUrl: 'https://example.test', achievedAt: '2026-09-26', status: 'accepted', verified: true });
  assert.equal(result.record.id, 1);
  assert.equal(calls.at(-1).url, `${origin}/api/clip/submissions`);
  assert.equal(calls.at(-1).headers.Authorization, `Bearer ${credential.token}`);
  assert.equal(calls.at(-1).anonymous, true);
  assert.equal(calls.at(-1).redirect, 'error');
  assert.deepEqual(Object.keys(JSON.parse(calls.at(-1).data)).sort(), ['achievedAt', 'challengeId', 'playerId', 'playerNote', 'rawVideoUrl', 'videoUrl']);
  await assert.rejects(client.request('review', {}), /未知操作/);
  await client.open(); assert.equal(calls.at(-1).opened, `${origin}/admin/submission_token`);
});

test('写入超时和异常响应不重试；401 清除失效凭据但不覆盖新授权', async () => {
  const f = fixture(); f.storage.set(TOKEN_KEY, credential);
  f.respond(options => options.ontimeout());
  await assert.rejects(f.client.request('submit', {}), /刷新重复检查或到金榜后台核对/);
  assert.equal(f.calls.length, 1);
  f.respond(options => options.onload({ status: 200, responseText: 'not json' }));
  await assert.rejects(f.client.request('submit', {}), /保存结果不确定/);
  f.respond(options => options.onload({ status: 401, responseText: '{"error":"授权失效"}' }));
  await assert.rejects(f.client.request('submit', {}), /授权失效/);
  assert.equal(f.storage.has(TOKEN_KEY), false);
  f.storage.set(TOKEN_KEY, credential);
  f.respond(options => { f.storage.set(TOKEN_KEY, { ...credential, token: `cngclip_${'b'.repeat(43)}` }); options.onload({ status: 401, responseText: '{}' }); });
  await assert.rejects(f.client.request('submit', {}));
  assert.equal(f.storage.get(TOKEN_KEY).token, `cngclip_${'b'.repeat(43)}`);
});

test('重复查询保留原有双源结果及部分失败警告，不把读取失败当作没有重复', async () => {
  const f = fixture(); f.storage.set(TOKEN_KEY, credential);
  const publicRecord = { id: 1, playerId: 3, challengeId: 8, status: 'accepted' };
  const pending = { id: 2, playerId: 3, challengeId: 8, status: 'pending' };
  f.respond(options => options.onload({ status: 200, responseText: JSON.stringify(options.url.includes('/clip/')
    ? { data: [pending, { ...pending, id: 3, playerId: 4 }] } : { records: [publicRecord] }) }));
  assert.deepEqual(await f.client.request('records', { playerId: 3 }), { publicRecords: [publicRecord], adminRecords: [pending], warnings: [] });
  f.respond(options => options.url.includes('/clip/') ? options.onerror() : options.onload({ status: 200, responseText: JSON.stringify({ records: [publicRecord] }) }));
  const incomplete = await f.client.request('records', { playerId: 3 });
  assert.deepEqual(incomplete.publicRecords, [publicRecord]); assert.deepEqual(incomplete.adminRecords, []);
  assert.match(incomplete.warnings[0], /待审核记录读取失败/);
  f.respond(options => options.url.includes('/clip/') ? options.onload({ status: 200, responseText: JSON.stringify({ data: [pending] }) }) : options.onerror());
  const publicFailed = await f.client.request('records', { playerId: 3 });
  assert.deepEqual(publicFailed.adminRecords, [pending]); assert.deepEqual(publicFailed.warnings, ['已有成绩读取失败']);
});
