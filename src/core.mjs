export const statusNames = { pending: '待审核', accepted: '已通过', hidden: '隐藏', rejected: '已拒绝' };

export function videoRef(raw) {
  try {
    const text = String(raw || '').trim();
    const url = new URL(/^BV[\da-zA-Z]{10}$/.test(text) ? `https://www.bilibili.com/video/${text}` : text, 'https://www.bilibili.com');
    if (!['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'].includes(url.hostname) || !/^https?:$/.test(url.protocol)) return null;
    const bv = url.pathname.match(/^\/video\/(BV[\da-zA-Z]{10})\/?$/)?.[1];
    const p = url.searchParams.get('p') || '1';
    if (!bv || !/^[1-9]\d{0,3}$/.test(p)) return null;
    return { bv, key: `${bv}:${Number(p)}`, url: `https://www.bilibili.com/video/${bv}${Number(p) > 1 ? `?p=${Number(p)}` : ''}` };
  } catch { return null; }
}

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value ? value : '';
}
export function beijingDate(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time + 8 * 3600000).toISOString().slice(0, 10) : '';
}
export function fullCardDate(text) {
  const match = text?.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/);
  return match ? validDate(`${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`) : '';
}
export function playerUids(player) {
  if (player.bilibiliUids?.length) return player.bilibiliUids.map(String);
  return [String(player.bilibiliUid || player.bilibiliUrl?.match(/space\.bilibili\.com\/(\d+)/)?.[1] || '')].filter(Boolean);
}
export function mergeRecords(publicRecords, adminRecords) {
  return [...new Map([...publicRecords.map(r => ({ ...r, status: r.status || 'accepted' })), ...adminRecords].map(r => [r.id, r])).values()];
}
export function duplicates(records, playerId, challengeId, url) {
  const key = videoRef(url)?.key;
  return records.filter(r => r.playerId === playerId && r.challengeId === challengeId)
    .map(r => ({ ...r, sameVideo: Boolean(key && videoRef(r.videoUrl)?.key === key) }));
}
export function submissionBody({ player, challenge, videoUrl, achievedAt, rawVideoUrl = '', playerNote = '' }) {
  if (!player || !challenge) throw new Error('请选择金榜玩家和已有挑战。');
  const video = videoRef(videoUrl);
  if (!video) throw new Error('请填写有效的 B 站 BV 视频链接。');
  if (!validDate(achievedAt)) throw new Error('请填写有效的达成日期。');
  if (rawVideoUrl) {
    let url; try { url = new URL(rawVideoUrl); } catch { /* validated below */ }
    if (!url || !['http:', 'https:'].includes(url.protocol)) throw new Error('RAW 视频链接无效。');
  }
  // 与 AdminAddRecordTab 一致：pending 交给后端处理 Standard 自动通过。
  const status = ['unwilling', 'blocked'].includes(player.status) ? 'rejected' : 'pending';
  return { playerId: player.id, challengeId: challenge.id, videoUrl: video.url, achievedAt, rawVideoUrl, playerNote, status };
}

export function readCard(card) {
  const link = card.querySelector('a[href*="/video/BV"]');
  const video = videoRef(link?.getAttribute('href'));
  if (!video) return null;
  const owner = card.querySelector('a[href*="space.bilibili.com/"]');
  const uid = owner?.getAttribute('href')?.match(/space\.bilibili\.com\/(\d+)/)?.[1] || '';
  return { ...video, uid,
    title: card.querySelector('h3[title], .title[title]')?.getAttribute('title') || card.querySelector('h3, .title')?.textContent?.trim() || video.bv,
    author: card.querySelector('.bili-video-card__info--author, .up-name')?.textContent?.trim() || uid,
    date: fullCardDate(card.querySelector('.bili-video-card__info--date, .so-icon.time')?.textContent),
  };
}

export function readVideoPage(doc, href) {
  const canonical = doc.querySelector('meta[property="og:url"]')?.content;
  const video = videoRef(href);
  if (!video || (canonical && videoRef(canonical)?.bv !== video.bv)) return null;
  // Scope to the uploader panel: descriptions and recommendations also contain UID links.
  const owner = doc.querySelector('.up-info-container a.up-name[href*="space.bilibili.com/"]');
  const title = doc.querySelector('h1.video-title');
  if (!owner || !title) return null;
  const uid = owner.getAttribute('href')?.match(/space\.bilibili\.com\/(\d+)/)?.[1] || '';
  return { ...video, uid, author: owner.textContent.trim(),
    title: title.getAttribute('title') || title.textContent.trim(),
    date: dateFromVideoDocument(doc, video.bv) };
}

export function dateFromVideoDocument(doc, bv) {
  const canonical = doc.querySelector('meta[property="og:url"]')?.content;
  if (canonical && videoRef(canonical)?.bv !== bv) return '';
  const iso = doc.querySelector('meta[property="video:release_date"], meta[itemprop="datePublished"]')?.content;
  if (iso && /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso)) return beijingDate(iso);
  return fullCardDate(doc.querySelector('.pubdate-ip-text')?.textContent);
}
