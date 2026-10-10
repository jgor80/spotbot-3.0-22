// Broadcast-style images, drawn as SVG and rendered to PNG with resvg (no browser needed).
//   recapGraphic   16:9 full-time card: crests, scoreline, scorers, assists, Man of the Match
//   cardSheet      FUT-style player cards, up to 8 per image
//   totwPoster     Team of the Week on a pitch, 4:5 for Instagram and Discord
// Fonts ship in assets/fonts (Oswald for headlines, Inter for text; both SIL OFL).
// Emoji are not drawn: the fonts don't have them, so keep text plain.

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Resvg } = require('@resvg/resvg-js');

const FONT_DIR = path.join(__dirname, 'assets', 'fonts');
const FONT_FILES = fs.existsSync(FONT_DIR)
  ? fs
      .readdirSync(FONT_DIR)
      .filter((f) => f.endsWith('.ttf'))
      .map((f) => path.join(FONT_DIR, f))
  : [];
const HEAD = 'Oswald';
const BODY = 'Inter';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 6000;
const DEFAULT_ACCENT = 0x22c55e;

function render(svg, width) {
  const resvg = new Resvg(svg, {
    fitTo: width ? { mode: 'width', value: width } : { mode: 'original' },
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: BODY },
  });
  return resvg.render().asPng();
}

function esc(text) {
  return (
    String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // Drop emoji and other symbols the bundled fonts can't draw
      .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
      .trim()
  );
}

// Font size that fits text in a width, assuming an average glyph is `ratio` em wide
function fit(text, maxWidth, maxSize, ratio = 0.55, minSize = 10) {
  const len = Math.max(String(text || '').length, 1);
  return Math.max(minSize, Math.min(maxSize, Math.floor(maxWidth / (len * ratio))));
}

function clip(text, max) {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Split text into at most maxLines lines of about width characters (the last one clipped)
function wrap(text, width, maxLines) {
  const lines = [];
  let line = '';
  for (const word of String(text || '')
    .split(/\s+/)
    .filter(Boolean)) {
    if (line && (line + ' ' + word).length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) lines[maxLines - 1] = clip(lines.slice(maxLines - 1).join(' '), width);
  return lines.slice(0, maxLines);
}

function hex(color, fallback = DEFAULT_ACCENT) {
  const n = Number.isInteger(color) ? color : fallback;
  return `#${n.toString(16).padStart(6, '0')}`;
}

// Mix a colour toward black (amount < 0) or white (amount > 0)
function shade(color, amount) {
  const n = Number.isInteger(color) ? color : DEFAULT_ACCENT;
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

// Download an image (crest, avatar) as a data URI; null when it can't be fetched
async function fetchImage(url) {
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(url || '')) return url; // bundled assets
  if (!url || !/^https:\/\//i.test(url)) return null;
  try {
    const res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: IMAGE_TIMEOUT_MS,
      maxContentLength: MAX_IMAGE_BYTES,
      validateStatus: (s) => s === 200,
    });
    const type = String(res.headers['content-type'] || '').split(';')[0];
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(res.data).toString('base64')}`;
  } catch {
    return null;
  }
}

// EA's crest CDN by crest/team id (verified: serves both real-club and custom Pro Clubs crests)
function eaCrestUrl(crestAssetId) {
  const id = String(crestAssetId || '').replace(/\D/g, '');
  return id ? `https://eafc24.content.easports.com/fifa/fltOnlineAssets/24B23FDE-7835-41C2-87A2-F453DFDB2E82/2024/fcweb/crests/256x256/l${id}.png` : null;
}

function initials(name) {
  const words = String(name || '?')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '?';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

// A round crest: the image when we have one, else initials on the accent colour
function crest(cx, cy, r, image, name, color) {
  const id = `c${Math.round(cx)}x${Math.round(cy)}`;
  if (image) {
    return `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
      <circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="rgba(255,255,255,0.12)"/>
      <image href="${image}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="rgba(255,255,255,0.35)" stroke-width="4"/>
    <text x="${cx}" y="${cy + r * 0.28}" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="${r * 0.8}" fill="#fff">${esc(initials(name))}</text>`;
}

// ---------- Match recap ----------

const RESULT_STYLE = {
  win: { label: 'WIN', color: '#22c55e' },
  draw: { label: 'DRAW', color: '#eab308' },
  loss: { label: 'DEFEAT', color: '#ef4444' },
};

// Box score columns; every value comes straight from EA's per-player match stats
const BOX_COLUMNS = [
  ['RAT', 90, (p) => (p.rating ? Number(p.rating).toFixed(1) : '-')],
  ['GLS', 70, (p) => p.goals || '-'],
  ['AST', 70, (p) => p.assists || '-'],
  ['SHT', 70, (p) => p.shots || '-'],
  ['PAS', 100, (p) => (p.passAttempts ? `${p.passesMade}/${p.passAttempts}` : '-')],
  ['TKL', 80, (p) => (p.tackleAttempts || p.tackles ? `${p.tackles}/${p.tackleAttempts || p.tackles}` : '-')],
  ['DEF', 64, (p) => p.stops || '-'],
  ['KEY', 64, (p) => p.chances || '-'],
  ['SVS', 60, (p) => p.saves || '-'],
];

// d: { clubName, opponentName, scoreFor, scoreAgainst, result, crestFor, crestAgainst,
//      players: [{ name, position, rating, goals, assists, shots, passesMade, passAttempts, tackles, tackleAttempts, saves, motm, red }],
//      motm: { name, rating, goals, assists, avatar } | null, accent, competition, dateText, details[], footer, talkingPoint }
// Backgrounds are bundled, representative AI artwork, never player likenesses.
const BACKGROUNDS = new Map();
const BG_VARIANTS = { attack: ['attack', 'attack2', 'attack3'], defence: ['defence', 'defence2'], keeper: ['keeper', 'keeper2'] };
function actionBackground(position, seed = '') {
  const kind = /^(GK|goalkeeper)$/i.test(position || '') ? 'keeper' : /^(DEF|CB|LB|RB|defender)$/i.test(position || '') ? 'defence' : 'attack';
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const list = BG_VARIANTS[kind];
  const key = list[h % list.length];
  if (!BACKGROUNDS.has(key)) {
    try {
      const image = fs.readFileSync(path.join(__dirname, 'assets', 'backgrounds', `${key}.jpg`));
      BACKGROUNDS.set(key, `data:image/jpeg;base64,${image.toString('base64')}`);
    } catch { BACKGROUNDS.set(key, null); }
  }
  return BACKGROUNDS.get(key) || (key !== kind ? actionBackground(position, '') : null);
}

function recapGraphic(d) {
  const W = 1600, H = 900;
  const accent = hex(d.accent);
  const res = RESULT_STYLE[d.result] || RESULT_STYLE.draw;
  const motm = d.motm;
  const players = (d.players || []).slice(0, 11);
  const background = actionBackground(motm?.position, d.seed);
  const tx = 550, tw = 1000, rowH = 40;
  const colX = [];
  let cx = tx + tw;
  for (let i = BOX_COLUMNS.length - 1; i >= 0; i--) {
    colX[i] = cx - BOX_COLUMNS[i][1] / 2 - 10;
    cx -= BOX_COLUMNS[i][1];
  }
  const headers = BOX_COLUMNS.map(([label], i) => `<text x="${colX[i]}" y="319" text-anchor="middle" font-family="${HEAD}" font-size="20" fill="#a8b8b0">${label}</text>`).join('');
  const rows = players.map((p, r) => {
    const y = 337 + r * rowH, mid = y + 27;
    return `<rect x="${tx}" y="${y}" width="${tw}" height="${rowH}" fill="${p.motm ? '#193b2c' : r % 2 ? '#0f1e19' : '#14251e'}" fill-opacity="0.96"/>
      ${p.motm ? `<rect x="${tx}" y="${y}" width="4" height="${rowH}" fill="${accent}"/>` : ''}
      <text x="${tx + 16}" y="${mid}" font-family="${BODY}" font-weight="700" font-size="${fit(p.name, 250, 20, 0.58, 14)}" fill="#ffffff">${esc(clip(p.name, 24))}</text>
      <text x="${tx + 280}" y="${mid}" font-family="${HEAD}" font-size="16" fill="${p.red ? '#fb7185' : '#a8b8b0'}">${esc(p.position)}${p.red ? ' RED' : ''}</text>
      ${BOX_COLUMNS.map(([, , get], i) => `<text x="${colX[i]}" y="${mid}" text-anchor="middle" font-family="${BODY}" font-size="20" font-weight="${i === 0 ? 700 : 400}" fill="${i === 0 ? '#f7d776' : '#ffffff'}">${esc(get(p))}</text>`).join('')}`;
  }).join('');
  const sum = key => players.reduce((n, p) => n + (Number(p[key]) || 0), 0);
  const passes = sum('passAttempts');
  const shots = sum('shots');
  const metrics = [['SHOTS', shots], ['PASS COMPLETION', passes ? `${Math.round(sum('passesMade') / passes * 100)}%` : '—'], ['TACKLES WON', sum('tackles')]];
  const card = motm ? {
    name: motm.name, position: motm.position, avatar: motm.avatar,
    overall: Math.max(40, Math.min(99, Math.round(18 + (Number(motm.rating) || 0) * 8))),
    ratingDisplay: Number(motm.rating) > 0 ? Number(motm.rating).toFixed(1) : '—',
    ratingLabel: 'MATCH RTG', inForm: Number(motm.rating) >= 8.5,
    stats: motm.position === 'GK'
      ? [['SAV', motm.saves], ['GLS', motm.goals], ['AST', motm.assists], ['PAS', motm.passAttempts ? `${Math.round(motm.passesMade / motm.passAttempts * 100)}%` : '—'], ['TKL', motm.tackles], ['SHT', motm.shots]]
      : [['GLS', motm.goals], ['AST', motm.assists], ['SHT', motm.shots], ['PAS', motm.passAttempts ? `${Math.round(motm.passesMade / motm.passAttempts * 100)}%` : '—'], ['TKL', motm.tackles], ['SAV', motm.saves]],
    badges: [motm.motm ? 'EA MOTM' : 'TOP RATED'],
  } : null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="veil"><stop offset="0" stop-color="#07120e" stop-opacity="0.12"/><stop offset="0.36" stop-color="#07120e" stop-opacity="0.78"/><stop offset="1" stop-color="#07120e" stop-opacity="0.92"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="#10251a"/>
  ${background ? `<image href="${background}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>` : ''}
  <rect width="${W}" height="${H}" fill="url(#veil)"/>
  <rect width="${W}" height="52" fill="#07120e" fill-opacity="0.94"/>
  <rect width="10" height="52" fill="${accent}"/>
  <text x="38" y="35" font-family="${HEAD}" font-weight="700" font-size="24" fill="#ffffff">${d.headline ? `<tspan fill="${accent}">LA GAZZETTA</tspan> / ${esc(clip(d.headline, 70)).toUpperCase()}` : 'GAFFERBOT / MATCHDAY'}</text>
  <text x="1550" y="34" text-anchor="end" font-family="${BODY}" font-size="18" fill="#b7c6bf">${esc(clip(d.dateText, 60))}</text>
  <rect x="32" y="74" width="1536" height="166" fill="#07120e" fill-opacity="0.90"/>
  ${crest(110, 157, 52, d.crestFor, d.clubName, accent)}
  <text x="184" y="151" font-family="${HEAD}" font-weight="700" font-size="${fit(d.clubName, 380, 42, 0.55, 18)}" fill="#ffffff">${esc(clip(d.clubName, 30).toUpperCase())}</text>
  <text x="184" y="190" font-family="${BODY}" font-size="19" fill="#b7c6bf">${esc(clip(d.competition || 'EA FC / PRO CLUBS', 28))}</text>
  <text x="800" y="177" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="100" fill="#ffffff">${Number(d.scoreFor) || 0} : ${Number(d.scoreAgainst) || 0}</text>
  <rect x="710" y="196" width="180" height="32" fill="${res.color}"/>
  <text x="800" y="219" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="20" fill="#07120e">FULL TIME / ${res.label}</text>
  ${crest(1490, 157, 52, d.crestAgainst, d.opponentName, '#374f43')}
  <text x="1416" y="155" text-anchor="end" font-family="${HEAD}" font-weight="700" font-size="${fit(d.opponentName, 380, 42, 0.55, 18)}" fill="#ffffff">${esc(clip(d.opponentName, 30).toUpperCase())}</text>
  <text x="${tx}" y="281" font-family="${HEAD}" font-size="22" fill="${accent}">MATCH CENTRE / PLAYER RATINGS</text>
  <rect x="${tx}" y="295" width="${tw}" height="36" fill="#07120e"/>
  <text x="${tx + 16}" y="319" font-family="${HEAD}" font-size="20" fill="#a8b8b0">PLAYER</text>${headers}${rows}
  ${!players.length ? `<text x="580" y="390" font-family="${BODY}" font-size="24" fill="#b7c6bf">Player stats not available</text>` : ''}
  <rect x="200" y="280" width="310" height="42" fill="#07120e" fill-opacity="0.90"/>
  <text x="355" y="309" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="22" fill="#f7d776">${motm?.motm ? 'MAN OF THE MATCH' : 'MATCH SPOTLIGHT'}</text>
  ${d.savedCard ? `<image href="${d.savedCard}" x="205" y="332" width="294" height="414" preserveAspectRatio="xMidYMid meet"/>
    <text x="352" y="772" text-anchor="middle" font-family="${HEAD}" font-size="22" fill="#f7d776">MATCH RTG ${esc(card?.ratingDisplay || '—')}</text>
    <text x="352" y="794" text-anchor="middle" font-family="${BODY}" font-size="12" fill="#b7c6bf">SAVED CARD / COLLECTION STATS</text>` : card ? `<g transform="translate(205 338) scale(0.98)">${cardSvg(card, 0, 0)}</g>` : ''}
  ${metrics.map(([label, value], i) => `<text x="${585 + i * 325}" y="804" font-family="${HEAD}" font-size="20" fill="#b7c6bf">${label} <tspan fill="#ffffff" font-weight="700">${value}</tspan></text>`).join('')}
  <rect y="833" width="${W}" height="67" fill="#07120e"/>
  <rect y="833" width="9" height="67" fill="${accent}"/>
  <text x="38" y="862" font-family="${BODY}" font-weight="700" font-size="${fit(d.talkingPoint || (d.details || []).filter(Boolean).join(' / '), 1480, 21, 0.58, 14)}" fill="#ffffff">${esc(clip(d.talkingPoint || (d.details || []).filter(Boolean).join(' / '), 135))}</text>
  <text x="38" y="888" font-family="${BODY}" font-size="14" fill="#a8b8b0">EA MATCH DATA / ${esc(clip(d.footer || 'GAFFERBOT', 70))}</text>
  <text x="1550" y="888" text-anchor="end" font-family="${BODY}" font-size="13" fill="#a8b8b0">${d.savedCard ? 'SAVED PLAYER CARD / AI ART' : 'AI ACTION ART / DISCORD AVATARS'}</text>
  </svg>`;
  return render(svg);
}

// ---------- FUT cards ----------

const TIERS = {
  inform: { top: '#1f2937', bottom: '#020617', ink: '#facc15', sub: '#e2e8f0', edge: '#facc15', label: 'IN FORM' },
  gold: { top: '#f7e08b', bottom: '#c9a227', ink: '#3b2f05', sub: '#4a3b07', edge: '#fff4c2', label: 'GOLD' },
  silver: { top: '#e5e7eb', bottom: '#9ca3af', ink: '#1f2937', sub: '#374151', edge: '#ffffff', label: 'SILVER' },
  bronze: { top: '#e0b089', bottom: '#9a5b2e', ink: '#2b1606', sub: '#3d220c', edge: '#f6d3b5', label: 'BRONZE' },
};

function tierFor(overall, inForm) {
  if (inForm) return 'inform';
  if (overall >= 75) return 'gold';
  if (overall >= 65) return 'silver';
  return 'bronze';
}

// card: { name, position, overall, avatar, stats: [[label, value] x6], badges: [], inForm, club }
function cardSvg(card, x, y) {
  if (card.savedCard) return `<image href="${card.savedCard}" x="${x}" y="${y}" width="300" height="440" preserveAspectRatio="xMidYMid meet"/>`;
  const w = 300;
  const h = 440;
  const t = TIERS[tierFor(card.overall, card.inForm)];
  const id = `k${Math.round(x)}_${Math.round(y)}`;
  const shape = `M${x + 30} ${y} H${x + w - 30} Q${x + w} ${y} ${x + w} ${y + 40} V${y + h - 70} Q${x + w} ${y + h - 30} ${x + w / 2} ${y + h} Q${x} ${y + h - 30} ${x} ${y + h - 70} V${y + 40} Q${x} ${y} ${x + 30} ${y} Z`;
  const stats = (card.stats || []).slice(0, 6);
  const statText = stats
    .map(([label, value], i) => {
      const col = i < 3 ? 0 : 1;
      const row = i % 3;
      const sx = x + 46 + col * 118;
      const sy = y + 326 + row * 30;
      return `<text x="${sx}" y="${sy}" font-family="${HEAD}" font-weight="700" font-size="24" fill="${t.ink}">${esc(value)}</text>
        <text x="${sx + 60}" y="${sy}" font-family="${HEAD}" font-weight="500" font-size="18" fill="${t.sub}">${esc(label)}</text>`;
    })
    .join('');
  const badges = (card.badges || []).slice(0, 2);
  const badgeText = badges
    .map((b, i) => {
      const bw = 104;
      const bx = x + w / 2 - (badges.length * bw + (badges.length - 1) * 8) / 2 + i * (bw + 8);
      return `<rect x="${bx}" y="${y + 396}" width="${bw}" height="22" rx="11" fill="${t.ink}" opacity="0.9"/>
        <text x="${bx + bw / 2}" y="${y + 412}" text-anchor="middle" font-family="${HEAD}" font-weight="500" font-size="14" letter-spacing="1" fill="${t.top}">${esc(b.toUpperCase())}</text>`;
    })
    .join('');
  const avatar = card.avatar
    ? `<clipPath id="${id}a"><circle cx="${x + 185}" cy="${y + 140}" r="78"/></clipPath>
       <image href="${card.avatar}" x="${x + 107}" y="${y + 62}" width="156" height="156" clip-path="url(#${id}a)" preserveAspectRatio="xMidYMid slice"/>`
    : `<circle cx="${x + 185}" cy="${y + 140}" r="78" fill="${t.ink}" opacity="0.15"/>
       <text x="${x + 185}" y="${y + 162}" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="60" fill="${t.ink}" opacity="0.7">${esc(initials(card.name))}</text>`;
  return `<g>
    <defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.top}"/><stop offset="1" stop-color="${t.bottom}"/></linearGradient></defs>
    <path d="${shape}" fill="url(#${id}g)" stroke="${t.edge}" stroke-width="4"/>
    <text x="${x + 56}" y="${y + 90}" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="64" fill="${t.ink}">${esc(card.ratingDisplay ?? (Number(card.overall) || '–'))}</text>
    <text x="${x + 56}" y="${y + 126}" text-anchor="middle" font-family="${HEAD}" font-weight="500" font-size="28" fill="${t.ink}">${esc(card.position || '')}</text>
    ${card.ratingLabel ? `<text x="${x + 56}" y="${y + 148}" text-anchor="middle" font-family="${HEAD}" font-size="12" fill="${t.sub}">${esc(card.ratingLabel)}</text>` : ''}
    ${card.inForm && !card.ratingLabel ? `<text x="${x + 56}" y="${y + 156}" text-anchor="middle" font-family="${HEAD}" font-weight="500" font-size="14" letter-spacing="1" fill="${t.ink}">IN FORM</text>` : ''}
    ${avatar}
    <text x="${x + w / 2}" y="${y + 268}" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="${fit(card.name, 250, 34, 0.5, 16)}" fill="${t.ink}">${esc(clip(card.name, 22).toUpperCase())}</text>
    <line x1="${x + 40}" y1="${y + 286}" x2="${x + w - 40}" y2="${y + 286}" stroke="${t.ink}" stroke-opacity="0.35" stroke-width="2"/>
    <line x1="${x + w / 2 - 6}" y1="${y + 304}" x2="${x + w / 2 - 6}" y2="${y + 392}" stroke="${t.ink}" stroke-opacity="0.25" stroke-width="2"/>
    ${statText}
    ${badgeText}
  </g>`;
}

// cards: up to 8 per image, 4 per row. title/subtitle head the sheet.
function cardSheet({ cards, title, subtitle, accent, footer }) {
  const perRow = Math.min(4, Math.max(cards.length, 1));
  const rows = Math.ceil(cards.length / 4) || 1;
  const W = 80 + perRow * 340;
  const H = 170 + rows * 480 + 40;
  const body = cards.map((c, i) => cardSvg(c, 60 + (i % 4) * 340, 150 + Math.floor(i / 4) * 480)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="sbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset="1" stop-color="${shade(accent, -0.6)}"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#sbg)"/>
    <rect width="${W}" height="8" fill="${hex(accent)}"/>
    <text x="60" y="80" font-family="${HEAD}" font-weight="700" font-size="${fit(title, W - 120, 52, 0.5, 24)}" fill="#fff">${esc(title.toUpperCase())}</text>
    ${subtitle ? `<text x="60" y="118" font-family="${BODY}" font-size="22" fill="#94a3b8">${esc(subtitle)}</text>` : ''}
    ${body}
    <text x="${W - 60}" y="${H - 18}" text-anchor="end" font-family="${BODY}" font-size="16" fill="#64748b">${esc(footer || 'GafferBot')}</text>
  </svg>`;
  return render(svg);
}

// ---------- Team of the Week ----------

// Rows from the back: GK, DEF, MID, FWD (4-3-3)
const TOTW_ROWS = [
  ['GK', 1, 1080],
  ['DEF', 4, 860],
  ['MID', 3, 620],
  ['FWD', 3, 380],
];

// players: [{ name, line: GK|DEF|MID|FWD, rating, club, games, avatar }]
function totwPoster({ players, title, subtitle, accent, crestImage, footer }) {
  const W = 1080;
  const H = 1350;
  const ac = hex(accent);
  const pitch = `
    <rect x="60" y="260" width="${W - 120}" height="${H - 330}" rx="24" fill="#14532d"/>
    ${Array.from({ length: 6 }, (_, i) => `<rect x="60" y="${260 + i * ((H - 330) / 6)}" width="${W - 120}" height="${(H - 330) / 12}" fill="#166534"/>`).join('')}
    <rect x="60" y="260" width="${W - 120}" height="${H - 330}" rx="24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="4"/>
    <line x1="60" y1="${260 + (H - 330) / 2}" x2="${W - 60}" y2="${260 + (H - 330) / 2}" stroke="rgba(255,255,255,0.35)" stroke-width="3"/>
    <circle cx="${W / 2}" cy="${260 + (H - 330) / 2}" r="90" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="3"/>
    <rect x="${W / 2 - 200}" y="${H - 70 - 160}" width="400" height="160" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="3"/>
    <rect x="${W / 2 - 200}" y="260" width="400" height="160" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="3"/>`;
  const used = new Set();
  const spots = [];
  for (const [line, count, y] of TOTW_ROWS) {
    const inLine = players.filter((p) => p.line === line && !used.has(p)).slice(0, count);
    inLine.forEach((p) => used.add(p));
    inLine.forEach((p, i) => {
      const x = W / 2 + (i - (inLine.length - 1) / 2) * (count === 4 ? 230 : 280);
      spots.push({ p, x, y });
    });
  }
  const tokens = spots
    .map(({ p, x, y }) => {
      const id = `t${Math.round(x)}_${y}`;
      const face = p.savedCard
        ? `<image href="${p.savedCard}" x="${x - 55}" y="${y - 130}" width="110" height="154" preserveAspectRatio="xMidYMid meet"/>`
        : p.avatar
        ? `<clipPath id="${id}"><circle cx="${x}" cy="${y - 20}" r="52"/></clipPath><image href="${p.avatar}" x="${x - 52}" y="${y - 72}" width="104" height="104" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`
        : `<text x="${x}" y="${y}" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="40" fill="#fff">${esc(initials(p.name))}</text>`;
      return `${p.savedCard ? '' : `<circle cx="${x}" cy="${y - 20}" r="58" fill="${ac}" stroke="#fff" stroke-width="4"/>`}
        ${face}
        <rect x="${x - 34}" y="${y + 22}" width="68" height="32" rx="8" fill="#0b1220"/>
        <text x="${x}" y="${y + 46}" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="24" fill="#facc15">${Number(p.rating).toFixed(1)}</text>
        <text x="${x}" y="${y + 86}" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="${fit(p.name, 210, 28, 0.5, 14)}" fill="#fff">${esc(clip(p.name, 18))}</text>
        ${p.club ? `<text x="${x}" y="${y + 110}" text-anchor="middle" font-family="${BODY}" font-size="16" fill="#d1fae5">${esc(clip(p.club, 22))}</text>` : ''}`;
    })
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="tbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1220"/><stop offset="1" stop-color="${shade(accent, -0.55)}"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#tbg)"/>
    <rect width="${W}" height="10" fill="${ac}"/>
    ${crestImage ? crest(W - 140, 130, 70, crestImage, '', ac) : ''}
    <text x="70" y="120" font-family="${HEAD}" font-weight="700" font-size="76" fill="#fff">TEAM OF THE WEEK</text>
    <text x="70" y="172" font-family="${HEAD}" font-weight="500" font-size="${fit(title, 780, 34, 0.5, 18)}" letter-spacing="2" fill="${ac}">${esc((title || '').toUpperCase())}</text>
    ${subtitle ? `<text x="70" y="214" font-family="${BODY}" font-size="22" fill="#94a3b8">${esc(subtitle)}</text>` : ''}
    ${pitch}
    ${tokens}
    <text x="${W - 70}" y="${H - 24}" text-anchor="end" font-family="${BODY}" font-size="18" fill="#64748b">${esc(footer || 'GafferBot')}</text>
  </svg>`;
  return render(svg);
}

module.exports = { render, esc, fetchImage, eaCrestUrl, recapGraphic, cardSheet, totwPoster, tierFor, hex };
