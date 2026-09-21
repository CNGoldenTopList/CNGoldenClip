import { createServer } from 'node:http';
import { build } from 'esbuild';
const root = new URL('../', import.meta.url);
const js = (await build({ entryPoints: [new URL('tests/harness.mjs', root).pathname.replace(/^\/([A-Za-z]:)/, '$1')], bundle: true, write: false,
  platform: 'browser', format: 'iife', charset: 'utf8' })).outputFiles[0].text;
const catalog = {
  players: [{ id: 1, name: '测试玩家甲', status: 'normal', bilibiliUids: ['100', '202'] }, { id: 2, name: '测试玩家乙', status: 'normal', bilibiliUids: ['300'] }],
  campaigns: [{ id: 1, name: 'Test Pack', cnName: '测试地图包' }],
  maps: [{ id: 1, campaignId: 1, name: 'Test Map', cnName: '测试地图' }],
  challenges: [{ id: 1, mapId: 1, name: 'C', type: 'C', tier: 't7' }, { id: 2, mapId: 1, name: 'C/FC', type: 'C/FC', tier: 'mid-std' }],
  multiMapChallenges: [{ id: 3, campaignId: 1, name: 'All Maps', tier: 't6' }],
};
const videoUrl = 'https://www.bilibili.com/video/BV1xx411c7mD';
const publicRecords = [{ id: 1, playerId: 1, challengeId: 1, videoUrl, achievedAt: '2026-09-10', status: 'accepted' }];
const adminRecords = [{ id: 2, playerId: 1, challengeId: 1, videoUrl: 'https://www.bilibili.com/video/BV1Dp4y1D7QR', achievedAt: '2026-09-16', status: 'pending' }];
let nextId = 3, failRecords = false, failSave = false;
const card = (bv, uid, name, date) => `<div class="bili-video-card"><a href="https://www.bilibili.com/video/${bv}/"><div class="cover">VIDEO</div><h3 title="${name}">${name}</h3></a><a href="https://space.bilibili.com/${uid}"><span class="bili-video-card__info--author">测试UP主</span><span class="bili-video-card__info--date"> · ${date}</span></a></div>`;
const html = body => `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>金榜油猴本地验证</title><style>body{font:16px system-ui;background:#f6f7f9;padding:40px;color:#334}main{display:flex;gap:30px;flex-wrap:wrap}.bili-video-card{width:300px;background:white;padding:12px;border-radius:8px}a{color:#334;text-decoration:none}.cover{height:155px;background:linear-gradient(130deg,#c9ddeb,#768ab9);display:grid;place-items:center;color:white;font-size:30px}h3{font-size:16px}.bili-video-card__info--date{font-size:12px}button{padding:8px;margin:8px}</style>${body}<script src="/harness.js"></script></html>`;
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const json = (value, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (path.startsWith('/video/')) return res.end(html(`<meta property="og:url" content="https://www.bilibili.com/video/BV1xx411c7mD/"><meta property="video:release_date" content="2026-09-16T16:00:00Z"><h1 class="video-title" title="测试地图 金草莓">测试地图 金草莓</h1><div class="up-info-container"><a class="up-name" href="https://space.bilibili.com/202/">测试UP主</a></div><div style="height:200px;background:#ddd">本地播放器占位</div><div id="arc_toolbar_report" style="display:flex;justify-content:space-between;align-items:center"><span>点赞　投币　收藏　分享</span><div class="video-toolbar-right" style="display:flex;align-items:center"><div class="video-complaint">稿件举报</div><div style="margin-left:16px">记笔记</div></div></div>`));
  if (path === '/harness.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(js); }
  if (path === '/fixture/video') return res.end('<meta property="og:url" content="https://www.bilibili.com/video/BV1xx411c7mD/"><meta property="video:release_date" content="2026-09-16T16:00:00Z">');
  if (path === '/api/auth/session') return json({ account: { role: 'admin', displayName: '本地测试管理员' } });
  if (path === '/api/catalog') return json(catalog);
  if (path === '/api/records') return json({ records: publicRecords.filter(r => r.playerId === Number(new URL(req.url, 'http://localhost').searchParams.get('playerId'))) });
  if (path === '/api/admin/submissions' && req.method === 'GET') return failRecords ? json({ error: '模拟队列不可用' }, 503) : json({ ok: true, data: adminRecords });
  if (path === '/api/admin/submissions' && req.method === 'POST') {
    let body = ''; for await (const chunk of req) body += chunk;
    if (failSave) return json({ ok: false, error: '模拟保存失败' }, 503);
    const input = JSON.parse(body); const record = { ...input, id: nextId++, status: input.challengeId === 2 ? 'accepted' : input.status };
    adminRecords.push(record); return json({ ok: true, record }, 201);
  }
  if (path === '/toggle-records') { failRecords = !failRecords; return res.end('ok'); }
  if (path === '/toggle-save') { failSave = !failSave; return res.end('ok'); }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  if (path === '/search') return res.end(html(`<h1>B 站搜索卡片 · 本地模拟</h1><p>所有提交只写本地内存，关闭服务即清空。</p><button onclick="document.querySelector('main').innerHTML=${JSON.stringify(card('BV1Dp4y1D7QR', '300', '另一条视频', '2020年6月20日')).replaceAll('"','&quot;')}">模拟翻页</button><button onclick="fetch('/toggle-records')">切换队列读取失败</button><button onclick="fetch('/toggle-save')">切换保存失败</button><main>${card('BV1xx411c7mD', '202', '【Celeste】测试地图 金草莓', '21小时前')}${card('BV1Dp4y1D7QR', '999', '未知玩家视频', '2020年6月20日')}</main>`));
  return res.end(html('<h1>金榜连接页 · 本地模拟管理员</h1><p>请保留此页，返回搜索页载入金榜。此页没有线上账号或 Cookie。</p>'));
});
server.listen(8279, '127.0.0.1', () => console.log('本地验证：http://127.0.0.1:8279/search'));
