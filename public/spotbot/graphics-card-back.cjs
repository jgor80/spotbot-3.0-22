'use strict';
// Generic card back for every player-card style: season-by-season rows from the
// permanent season archive plus the official EA Member List club totals.
// Only saved numbers are printed; nothing is invented.

const PAPER = new Set(['vintage', 'retro1960s', 'retro1970s', 'retro1986', 'retro1990s', 'sunday', 'mud', 'heritage']);

function theme(style, accent) {
  if (PAPER.has(style)) return { bg: '#efe4c8', panel: '#f8f0dc', ink: '#2a1d12', sub: '#6b5a42', accent: accent || '#c8553d', line: '#2a1d12', head: '#2a1d12', headInk: '#f8f0dc' };
  return { bg: '#0b0f17', panel: '#121a28', ink: '#f4f6fb', sub: '#9aa6bd', accent: accent || '#22c55e', line: '#2a3446', head: accent || '#22c55e', headInk: '#0b0f17' };
}

const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const rating = (v) => (Number(v) > 0 ? Number(v).toFixed(1) : '—');

// rows: [{ label, apps, goals, assists, cs, motm, rating }]
// totals: same shape (EA Member List) or null
function renderCardBack(d, G) {
  const esc = G.esc;
  const t = theme(d.style, d.accent);
  const W = 1434, H = 1024;
  const gk = /^(GK|GOAL)/i.test(String(d.position || ''));
  const cols = [['SEASON', 'label'], ['APPS', 'apps'], ['G', 'goals'], ['A', 'assists'], [gk ? 'CS' : 'CS', 'cs'], ['MOTM', 'motm'], ['RAT', 'rating']];
  const xs = [90, 470, 640, 790, 940, 1090, 1260];
  const rows = (d.rows || []).slice(-8);
  const name = String(d.name || 'PLAYER').toUpperCase().slice(0, 28);
  const cell = (r, k) => (k === 'rating' ? rating(r[k]) : fmt(r[k]));
  let y = 330;
  const body = rows.map((r) => {
    const out = `<line x1="80" x2="1354" y1="${y + 22}" y2="${y + 22}" stroke="${t.line}" stroke-opacity="0.35"/>` + cols.map(([, k], i) => `<text x="${xs[i]}" y="${y}" ${i ? 'text-anchor="middle"' : ''} font-family="Oswald" font-size="34" fill="${t.ink}">${esc(cell(r, k))}</text>`).join('');
    y += 62;
    return out;
  }).join('');
  const tot = d.totals;
  const totY = Math.max(y + 30, 560);
  const totals = tot ? `<rect x="70" y="${totY - 48}" width="1294" height="70" fill="${t.accent}" opacity="0.92"/>` + cols.map(([, k], i) => `<text x="${xs[i]}" y="${totY}" ${i ? 'text-anchor="middle"' : ''} font-family="Oswald" font-weight="700" font-size="36" fill="${t.headInk}">${esc(i ? cell(tot, k) : 'EA CLUB TOTAL')}</text>`).join('') : '';
  const empty = !rows.length && !tot ? `<text x="717" y="460" text-anchor="middle" font-family="Oswald" font-size="40" fill="${t.sub}">NO SEASONS RECORDED YET</text>` : '';
  return G.render(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${t.bg}"/>
    <rect x="30" y="30" width="${W - 60}" height="${H - 60}" fill="${t.panel}" stroke="${t.accent}" stroke-width="6"/>
    <rect x="30" y="30" width="${W - 60}" height="140" fill="${t.head}"/>
    <circle cx="130" cy="100" r="46" fill="${t.headInk}"/>
    <text x="130" y="117" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="44" fill="${t.head}">${esc(/^\d{1,2}$/.test(String(d.number || '')) ? d.number : String(d.position || 'P').toUpperCase().slice(0, 3))}</text>
    <text x="200" y="122" font-family="Oswald" font-weight="700" font-size="${Math.min(64, Math.floor(820 / Math.max(name.length * 0.55, 1)))}" fill="${t.headInk}">${esc(name)}</text>
    <text x="1360" y="92" text-anchor="end" font-family="Oswald" font-size="28" letter-spacing="4" fill="${t.headInk}">${esc(String(d.clubName || '').toUpperCase().slice(0, 28))}</text>
    <text x="1360" y="134" text-anchor="end" font-family="Oswald" font-size="24" letter-spacing="4" fill="${t.headInk}">${esc(String(d.position || '').toUpperCase().slice(0, 12))}</text>
    <text x="80" y="240" font-family="Oswald" font-weight="700" font-size="30" letter-spacing="6" fill="${t.accent}">CAREER RECORD</text>
    ${cols.map(([l], i) => `<text x="${xs[i]}" y="282" ${i ? 'text-anchor="middle"' : ''} font-family="Oswald" font-size="24" letter-spacing="3" fill="${t.sub}">${l}</text>`).join('')}
    <line x1="80" x2="1354" y1="298" y2="298" stroke="${t.line}" stroke-width="3"/>
    ${body}${totals}${empty}
    <text x="717" y="950" text-anchor="middle" font-family="Inter" font-size="18" fill="${t.sub}">${esc(`Season rows from saved competitive matches${tot ? ' · Club total from the official EA Member List' : ''}${d.edited ? ' · front stats member-edited' : ''} · SPOTBOT STUDIO`)}</text>
  </svg>`);
}

module.exports = { renderCardBack };
