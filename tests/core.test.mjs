import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readVideoPage, videoRef, fullCardDate, validDate, beijingDate, playerUids, mergeRecords, duplicates, submissionBody } from '../src/core.mjs';


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
