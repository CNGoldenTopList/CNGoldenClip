import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readVideoPage, videoRef, fullCardDate, validDate, beijingDate, playerUids, mergeRecords, duplicates, submissionBody } from '../src/core.mjs';
import { makeClient, startBridge, keyOf } from '../src/transport.mjs';

test('播放页保留分 P，读取 UP 主与北京时间日期，拒绝切换期间不一致的页面', () => {
  const elements = {
    'meta[property="og:url"]': { content: 'https://www.bilibili.com/video/BV1xx411c7mD/' },
    'meta[property="video:release_date"], meta[itemprop="datePublished"]': { content: '2026-09-16T16:00:00Z' },
    '.up-info-container a.up-name[href*="space.bilibili.com/"]': { textContent: ' UP主 ', getAttribute: () => '//space.bilibili.com/202/' },
    'h1.video-title': { textContent: '视频标题', getAttribute: () => '视频标题' },
  };
  const doc = { querySelector: selector => elements[selector] };
  const video = readVideoPage(doc, 'https://www.bilibili.com/video/BV1xx411c7mD/?p=2&spm=tracking');
  assert.equal(video.url, 'https://www.bilibili.com/video/BV1xx411c7mD?p=2');
  assert.equal(video.uid, '202');
  assert.equal(video.date, '2026-09-17');
  assert.equal(readVideoPage(doc, 'https://www.bilibili.com/video/BV1Dp4y1D7QR/'), null);
  delete elements['.up-info-container a.up-name[href*="space.bilibili.com/"]'];
  assert.equal(readVideoPage(doc, video.url), null);
});

test('按玩家与挑战提示重复，公共/管理记录按 ID 合并，不混入其他玩家和挑战', () => {
  const url = 'https://www.bilibili.com/video/BV1xx411c7mD';
  const publicRecords = [{ id: 1, playerId: 3, challengeId: 8, videoUrl: `${url}/?spm=1` }];
  const adminRecords = [{ ...publicRecords[0], status: 'hidden' },
    { id: 2, playerId: 3, challengeId: 8, status: 'pending', videoUrl: `${url}?p=2` },
    { id: 3, playerId: 4, challengeId: 8, status: 'pending', videoUrl: url },
    { id: 4, playerId: 3, challengeId: 9, status: 'pending', videoUrl: url }];
  const found = duplicates(mergeRecords(publicRecords, adminRecords), 3, 8, url);
  assert.deepEqual(found.map(r => [r.id, r.status, r.sameVideo]), [[1, 'hidden', true], [2, 'pending', false]]);
  assert.equal(videoRef('https://evil.test/video/BV1xx411c7mD'), null);
  assert.equal(videoRef('https://www.bilibili.com/video/BV1xx411c7mD?p=0'), null);
});

test('发布日期按北京时间，不把相对日期或没有年份的日期猜成今天', () => {
  assert.equal(beijingDate('2026-09-16T16:00:00Z'), '2026-09-17');
  assert.equal(fullCardDate(' · 2020年6月20日'), '2020-06-20');
  for (const text of ['21小时前', '9月17日', '刚刚', '2026年2月30日']) assert.equal(fullCardDate(text), '');
  assert.equal(validDate('2024-02-29'), '2024-02-29');
  assert.equal(validDate('2026-02-29'), '');
});

test('多个 UID 可匹配同一金榜玩家，提交仅使用原接口字段，Standard 仍交给后端', () => {
  const player = { id: 3, name: '测试玩家', bilibiliUid: '1', bilibiliUids: ['1', '2'], status: 'normal' };
  assert.deepEqual(playerUids(player), ['1', '2']);
  const input = { player, challenge: { id: 8, tier: 'mid-std' }, videoUrl: 'BV1xx411c7mD', achievedAt: '2026-09-17' };
  assert.deepEqual(submissionBody(input), { playerId: 3, challengeId: 8, status: 'pending',
    videoUrl: 'https://www.bilibili.com/video/BV1xx411c7mD', achievedAt: '2026-09-17', rawVideoUrl: '', playerNote: '' });
  assert.equal(submissionBody({ ...input, player: { ...player, status: 'unwilling' } }).status, 'rejected');
  assert.throws(() => submissionBody({ ...input, achievedAt: '' }));
});

test('GM 通道仅调用原接口，凭据保持同源；连接页重新初始化不会重放提交', async () => {
  const storage = new Map(), callbacks = new Map(); let sequence = 0, opened;
  const gm = {
    getValue: key => storage.get(key),
    setValue(key, value) { const old = storage.get(key); storage.set(key, value); for (const [k, fn] of callbacks.values()) if (k === key) fn(key, old, value, true); },
    deleteValue: key => storage.delete(key),
    addValueChangeListener(key, fn) { const id = ++sequence; callbacks.set(id, [key, fn]); return id; },
    removeValueChangeListener: id => callbacks.delete(id),
    getTab: fn => fn({}), saveTab() {}, openInTab: url => { opened = url; },
  };
  const client = makeClient(gm, 'https://cngist.com');
  await assert.rejects(client.request('catalog'), /连接金榜/);
  await client.open();
  const oldLocation = globalThis.location; globalThis.location = new URL(opened);
  const calls = []; let role = 'admin';
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.credentials, 'same-origin');
    const payload = url.endsWith('/api/auth/session') ? { account: { role, displayName: '管理员' } }
      : { record: { id: 99, status: 'pending' } };
    return { ok: true, status: 200, json: async () => payload };
  };
  try {
    await startBridge(gm, 'https://cngist.com', () => {}, fetcher);
    const body = submissionBody({ player: { id: 3 }, challenge: { id: 8 }, videoUrl: 'BV1xx411c7mD', achievedAt: '2026-09-17' });
    assert.equal((await client.request('submit', body)).record.id, 99);
    assert.equal(calls.filter(c => c.options.method === 'POST').length, 1);
    assert.equal(calls.at(-1).url, 'https://cngist.com/api/admin/submissions');
    assert.deepEqual(JSON.parse(calls.at(-1).options.body), body);
    await startBridge(gm, 'https://cngist.com', () => {}, fetcher);
    assert.equal(calls.filter(c => c.options.method === 'POST').length, 1);
    role = 'player'; await assert.rejects(client.request('submit', body), /管理员/);
    assert.equal(calls.filter(c => c.options.method === 'POST').length, 1);
    const channel = new URLSearchParams(globalThis.location.hash.slice(1)).get('cngist-intake');
    assert.equal(gm.getValue(keyOf(channel, 'request')), undefined);
  } finally { globalThis.location = oldLocation; }
});
