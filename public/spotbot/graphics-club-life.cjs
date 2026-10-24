// Club life graphics, drawn locally as SVG and rendered with resvg like graphics.cjs (no AI calls):
//   badgeStrip      the medals unlocked after a game, with who earned them and how rare they are
//   wrappedCard     one player's Club Wrapped for a month or season
//   awardsPoster    the Awards Night ceremony: each category's winner with their portrait
//   divisionPoster  promotion or relegation
// Player pictures are only ever their own saved Studio card art or original uploads, passed in as data URLs.

const G = require('./graphics.cjs');

const HEAD = 'Oswald';
const BODY = 'Inter';
const { esc } = G;

const TIER_STYLE = {
  common: { fill: '#b87333', light: '#f3c99a', ink: '#2b1606', label: 'COMMON' },
  rare: { fill: '#38bdf8', light: '#e0f2fe', ink: '#082f49', label: 'RARE' },
  epic: { fill: '#a855f7', light: '#f3e8ff', ink: '#2e1065', label: 'EPIC' },
  legendary: { fill: '#facc15', light: '#fef9c3', ink: '#422006', label: 'LEGENDARY' },
};

function clip(text, max) {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Font size that fits text in a width, assuming an average glyph is `ratio` em wide
function fit(text, maxWidth, maxSize, ratio = 0.55, minSize = 10) {
  const len = Math.max(String(text || '').length, 1);
  return Math.max(minSize, Math.min(maxSize, Math.floor(maxWidth / (len * ratio))));
}

function wrap(text, width, maxLines) {
  const lines = [];
  let line = '';
  for (const word of String(text || '').split(/\s+/).filter(Boolean)) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) lines[maxLines - 1] = clip(lines.slice(maxLines - 1).join(' '), width);
  return lines.slice(0, maxLines);
}

function hexToNum(color, fallback) {
  return Number.isInteger(color) ? color : fallback;
}

// A hexagonal medal with the badge's short glyph in the middle
function medal(cx, cy, r, tier, glyph) {
  const t = TIER_STYLE[tier] || TIER_STYLE.common;
  const pts = (rad) => Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  const id = `m${Math.round(cx)}_${Math.round(cy)}`;
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.light}"/><stop offset="1" stop-color="${t.fill}"/></linearGradient></defs>
    <polygon points="${pts(r)}" fill="url(#${id})" stroke="${t.light}" stroke-width="4"/>
    <polygon points="${pts(r * 0.78)}" fill="none" stroke="${t.ink}" stroke-opacity="0.35" stroke-width="3"/>
    <text x="${cx}" y="${cy + r * 0.22}" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="${fit(glyph, r * 1.2, r * 0.62, 0.55, 14)}" fill="${t.ink}">${esc(clip(glyph, 5))}</text>`;
}

// entries: [{ playerName, name, glyph, tier, rarity: '2 of 14 players' }] (up to 6 drawn)
function badgeStrip({ entries, clubName, accent }) {
  const list = (entries || []).slice(0, 6);
  const colW = 220;
  const W = Math.max(720, 80 + list.length * colW);
  const H = 470;
  const ac = G.hex(hexToNum(accent, 0x22c55e));
  const cols = list.map((e, i) => {
    const cx = (W - list.length * colW) / 2 + colW * i + colW / 2;
    const t = TIER_STYLE[e.tier] || TIER_STYLE.common;
    return `${medal(cx, 200, 78, e.tier, e.glyph || '★')}
      <text x="${cx}" y="318" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="${fit(e.name, colW - 20, 28, 0.5, 14)}" fill="#ffffff">${esc(clip(e.name, 22).toUpperCase())}</text>
      <text x="${cx}" y="348" text-anchor="middle" font-family="${HEAD}" font-size="16" letter-spacing="2" fill="${t.fill}">${t.label}</text>
      <text x="${cx}" y="384" text-anchor="middle" font-family="${BODY}" font-weight="700" font-size="${fit(e.playerName, colW - 20, 22, 0.58, 12)}" fill="#e2e8f0">${esc(clip(e.playerName, 20))}</text>
      ${e.rarity ? `<text x="${cx}" y="410" text-anchor="middle" font-family="${BODY}" font-size="14" fill="#94a3b8">${esc(clip(e.rarity, 28))}</text>` : ''}`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset="1" stop-color="#111827"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="8" fill="${ac}"/>
    <text x="40" y="62" font-family="${HEAD}" font-weight="700" font-size="34" fill="#ffffff">BADGE UNLOCKED</text>
    <text x="${W - 40}" y="62" text-anchor="end" font-family="${BODY}" font-size="18" fill="#94a3b8">${esc(clip(clubName, 40))}</text>
    ${cols}
    <text x="${W / 2}" y="${H - 22}" text-anchor="middle" font-family="${BODY}" font-size="14" fill="#64748b">EA MATCH DATA · GAFFERBOT</text>
  </svg>`;
  return G.render(svg);
}

// A round portrait, or initials on the accent colour
function portrait(cx, cy, r, image, name, color) {
  const id = `p${Math.round(cx)}_${Math.round(cy)}`;
  if (image) {
    return `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
      <circle cx="${cx}" cy="${cy}" r="${r + 5}" fill="${color}"/>
      <image href="${image}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#${id})" preserveAspectRatio="xMidYMin slice"/>`;
  }
  const initials = String(name || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="rgba(255,255,255,0.4)" stroke-width="4"/>
    <text x="${cx}" y="${cy + r * 0.3}" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="${r * 0.85}" fill="#ffffff">${esc(initials)}</text>`;
}

// d: { playerName, clubName, periodLabel, accent, photo, headline: "You were the club's ...",
//      tiles: [{ label, value, sub }] (6 drawn), badges: [{ glyph, tier }] }
function wrappedCard(d) {
  const W = 1080, H = 1350;
  const ac = G.hex(hexToNum(d.accent, 0x22c55e));
  const tiles = (d.tiles || []).slice(0, 6);
  const tileW = 470, tileH = 180;
  const tileSvg = tiles.map((t, i) => {
    const x = 60 + (i % 2) * (tileW + 20);
    const y = 560 + Math.floor(i / 2) * (tileH + 20);
    return `<rect x="${x}" y="${y}" width="${tileW}" height="${tileH}" rx="18" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.12"/>
      <text x="${x + 26}" y="${y + 44}" font-family="${BODY}" font-weight="700" font-size="17" letter-spacing="2" fill="${ac}">${esc(clip(t.label, 34).toUpperCase())}</text>
      <text x="${x + 26}" y="${y + 112}" font-family="${HEAD}" font-weight="700" font-size="${fit(t.value, tileW - 52, 58, 0.5, 22)}" fill="#ffffff">${esc(clip(t.value, 26))}</text>
      ${t.sub ? `<text x="${x + 26}" y="${y + 150}" font-family="${BODY}" font-size="${fit(t.sub, tileW - 52, 19, 0.56, 12)}" fill="#cbd5e1">${esc(clip(t.sub, 48))}</text>` : ''}`;
  }).join('');
  const headline = wrap(d.headline || '', 34, 2);
  const badges = (d.badges || []).slice(0, 8);
  const badgeSvg = badges.map((b, i) => medal(110 + i * 110, 1222, 40, b.tier, b.glyph || '★')).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="wbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset="0.6" stop-color="#111827"/><stop offset="1" stop-color="${ac}" stop-opacity="0.55"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#wbg)"/>
    <rect width="${W}" height="10" fill="${ac}"/>
    <text x="60" y="88" font-family="${HEAD}" font-weight="700" font-size="30" letter-spacing="4" fill="${ac}">CLUB WRAPPED</text>
    <text x="${W - 60}" y="88" text-anchor="end" font-family="${HEAD}" font-size="28" letter-spacing="2" fill="#cbd5e1">${esc(clip(String(d.periodLabel || '').toUpperCase(), 30))}</text>
    ${portrait(W - 190, 270, 120, d.photo, d.playerName, ac)}
    <text x="60" y="210" font-family="${HEAD}" font-weight="700" font-size="${fit(d.playerName, 680, 92, 0.5, 40)}" fill="#ffffff">${esc(clip(d.playerName, 22).toUpperCase())}</text>
    <text x="60" y="256" font-family="${BODY}" font-size="24" fill="#94a3b8">${esc(clip(d.clubName, 40))}</text>
    ${headline.map((l, i) => `<text x="60" y="${370 + i * 62}" font-family="${HEAD}" font-weight="700" font-size="54" fill="#ffffff">${esc(l)}</text>`).join('')}
    ${tileSvg}
    ${badges.length ? `<text x="60" y="1162" font-family="${BODY}" font-weight="700" font-size="17" letter-spacing="2" fill="${ac}">BADGES UNLOCKED</text>${badgeSvg}` : ''}
    <text x="${W / 2}" y="${H - 24}" text-anchor="middle" font-family="${BODY}" font-size="15" fill="#64748b">EA MATCH DATA · GAFFERBOT · gafferbot.app/wrapped</text>
  </svg>`;
  return G.render(svg);
}

// d: { clubName, periodLabel, accent, winners: [{ category, emoji, name, votes, photo, line }] }
function awardsPoster(d) {
  const W = 1200;
  const winners = (d.winners || []).slice(0, 6);
  const rowH = 210;
  const H = 300 + winners.length * rowH + 60;
  const gold = '#d4af37';
  const rows = winners.map((w, i) => {
    const y = 290 + i * rowH;
    return `<rect x="60" y="${y}" width="${W - 120}" height="${rowH - 24}" rx="20" fill="#ffffff" fill-opacity="0.05" stroke="${gold}" stroke-opacity="0.35"/>
      ${portrait(170, y + (rowH - 24) / 2, 70, w.photo, w.name, '#3f3a28')}
      <text x="280" y="${y + 58}" font-family="${BODY}" font-weight="700" font-size="20" letter-spacing="3" fill="${gold}">${esc(clip(String(w.category).toUpperCase(), 40))}</text>
      <text x="280" y="${y + 122}" font-family="${HEAD}" font-weight="700" font-size="${fit(w.name, 720, 64, 0.5, 28)}" fill="#ffffff">${esc(clip(w.name, 24).toUpperCase())}</text>
      <text x="280" y="${y + 160}" font-family="${BODY}" font-size="20" fill="#cbd5e1">${esc(clip(w.line || '', 70))}</text>
      ${w.votes != null ? `<text x="${W - 90}" y="${y + 122}" text-anchor="end" font-family="${HEAD}" font-weight="700" font-size="40" fill="${gold}">${w.votes}</text><text x="${W - 90}" y="${y + 152}" text-anchor="end" font-family="${BODY}" font-size="16" fill="#94a3b8">VOTE${w.votes === 1 ? '' : 'S'}</text>` : ''}`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><radialGradient id="abg" cx="0.5" cy="0" r="1.1"><stop offset="0" stop-color="#3b2f0b"/><stop offset="0.55" stop-color="#0b0a07"/><stop offset="1" stop-color="#000000"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#abg)"/>
    <rect width="${W}" height="10" fill="${gold}"/>
    <text x="${W / 2}" y="120" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="88" letter-spacing="6" fill="${gold}">AWARDS NIGHT</text>
    <text x="${W / 2}" y="176" text-anchor="middle" font-family="${HEAD}" font-size="34" letter-spacing="3" fill="#f5f0e1">${esc(clip(`${d.clubName} · ${d.periodLabel}`.toUpperCase(), 48))}</text>
    <text x="${W / 2}" y="222" text-anchor="middle" font-family="${BODY}" font-size="18" fill="#a8a29e">Voted by the squad</text>
    ${rows}
    <text x="${W / 2}" y="${H - 26}" text-anchor="middle" font-family="${BODY}" font-size="15" fill="#78716c">PORTRAITS FROM EACH PLAYER'S OWN STUDIO CARD OR PRO PHOTO · GAFFERBOT</text>
  </svg>`;
  return G.render(svg);
}

// d: { clubName, kind: 'promoted' | 'relegated', from, to, accent, crest }
function divisionPoster(d) {
  const W = 1200, H = 675;
  const up = d.kind === 'promoted';
  const color = up ? '#22c55e' : '#ef4444';
  const ac = G.hex(hexToNum(d.accent, up ? 0x22c55e : 0xef4444));
  const crest = d.crest ? `<image href="${d.crest}" x="${W - 330}" y="170" width="260" height="260" preserveAspectRatio="xMidYMid meet"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="dbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset="1" stop-color="${color}" stop-opacity="0.45"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#dbg)"/>
    <rect width="${W}" height="10" fill="${ac}"/>
    <text x="70" y="110" font-family="${HEAD}" font-weight="700" font-size="34" letter-spacing="4" fill="#cbd5e1">${esc(clip(d.clubName, 36).toUpperCase())}</text>
    <text x="70" y="290" font-family="${HEAD}" font-weight="700" font-size="170" fill="${color}">${up ? 'PROMOTED' : 'RELEGATED'}</text>
    <text x="74" y="380" font-family="${HEAD}" font-weight="700" font-size="56" fill="#ffffff">DIVISION ${esc(d.from ?? '?')}  ${up ? '→' : '→'}  DIVISION ${esc(d.to ?? '?')}</text>
    <text x="74" y="440" font-family="${BODY}" font-size="26" fill="#cbd5e1">${up ? 'Up we go. The next level starts now.' : 'Regroup, reset, go again.'}</text>
    ${crest}
    <text x="${W / 2}" y="${H - 28}" text-anchor="middle" font-family="${BODY}" font-size="15" fill="#94a3b8">EA CLUB DATA · GAFFERBOT</text>
  </svg>`;
  return G.render(svg);
}

module.exports = { badgeStrip, wrappedCard, awardsPoster, divisionPoster, TIER_STYLE, medal };
