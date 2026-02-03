#!/usr/bin/env node

/**
 * Update the "Today's picks" section in index.html.
 * Input is read from stdin as JSON: { date: "YYYY-MM-DD", picks: [{title,url,tag}] }
 *
 * This script is intentionally dumb: it just replaces the content between markers.
 */

const fs = require('fs');

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

(async () => {
  const raw = await readStdin();
  const payload = JSON.parse(raw || '{}');
  const date = payload.date || new Date().toISOString().slice(0, 10);
  const picks = Array.isArray(payload.picks) ? payload.picks : [];

  const indexPath = 'index.html';
  const html = fs.readFileSync(indexPath, 'utf8');

  const begin = '<!-- BEGIN DAILY -->';
  const end = '<!-- END DAILY -->';
  const hBegin = '<!-- BEGIN HISTORY -->';
  const hEnd = '<!-- END HISTORY -->';

  const start = html.indexOf(begin);
  const stop = html.indexOf(end);
  if (start === -1 || stop === -1 || stop < start) {
    throw new Error('Daily markers not found in index.html');
  }

  const hStart = html.indexOf(hBegin);
  const hStop = html.indexOf(hEnd);
  if (hStart === -1 || hStop === -1 || hStop < hStart) {
    throw new Error('History markers not found in index.html');
  }

  // Grab the previous daily block so we can archive it.
  const prevDailyBlock = html.slice(start, stop + end.length);
  const prevDateMatch = prevDailyBlock.match(/Updated:\s*([^<\n]+)\s*</);
  const prevDate = prevDateMatch ? prevDateMatch[1].trim() : null;

  // Extract the previous list items (keep as HTML).
  const prevLis = [...prevDailyBlock.matchAll(/<li>[\s\S]*?<\/li>/g)].map(m => m[0]);
  const prevHasRealPicks = prevLis.some(li => !li.includes('No picks today'));

  // Build today's daily block.
  const items = picks.slice(0, 5).map(p => {
    const title = escapeHtml(p.title || p.url);
    const url = escapeHtml(p.url || '#');
    const tag = p.tag ? ` <span class="tag">${escapeHtml(p.tag)}</span>` : '';
    return `          <li><a href="${url}" target="_blank" rel="noopener">${title}</a>${tag}</li>`;
  });

  const dailyBlock = [
    begin,
    `        <div class="footer">Updated: ${escapeHtml(date)}</div>`,
    '        <ul>',
    ...(items.length ? items : ['          <li><em>No picks today (yet).</em></li>']),
    '        </ul>',
    '        <div class="footer">Rule: small list; no fluff. If it feels like dashboard theater, it doesn’t ship.</div>',
    `        ${end}`
  ].join('\n');

  // Update history block (prepend previous day) if appropriate.
  let historyInner = html.slice(hStart + hBegin.length, hStop);

  const alreadyHasPrevDate = prevDate && historyInner.includes(`<summary>${escapeHtml(prevDate)}`);
  const shouldArchivePrev = prevDate && prevDate !== date && prevHasRealPicks && !alreadyHasPrevDate;

  if (shouldArchivePrev) {
    const entry = [
      '        <details>',
      `          <summary>${escapeHtml(prevDate)} <span class="tag">archived</span></summary>`,
      '          <ul>',
      ...prevLis.map(li => `            ${li}`),
      '          </ul>',
      '        </details>',
      ''
    ].join('\n');

    // Remove placeholder.
    historyInner = historyInner.replace(/\s*<div class="footer"><em>No history yet\.<\/em><\/div>\s*/m, '\n');

    // Prepend.
    historyInner = `\n${entry}${historyInner}`;
  }

  const newHtml =
    // Daily section
    html.slice(0, start) +
    dailyBlock +
    html.slice(stop + end.length, hStart) +
    // History section
    hBegin +
    historyInner +
    hEnd +
    html.slice(hStop + hEnd.length);

  fs.writeFileSync(indexPath, newHtml, 'utf8');
})();
