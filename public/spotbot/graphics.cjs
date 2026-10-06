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

// EA's crest CDN by asset id (URL pattern not verified from here; a failed fetch falls back to initials)
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
  ['TKL', 90, (p) => (p.tackleAttempts || p.tackles ? `${p.tackles}/${p.tackleAttempts || p.tackles}` : '-')],
  ['SVS', 70, (p) => p.saves || '-'],
];

// d: { clubName, opponentName, scoreFor, scoreAgainst, result, crestFor, crestAgainst,
//      players: [{ name, position, rating, goals, assists, shots, passesMade, passAttempts, tackles, tackleAttempts, saves, motm, red }],
//      motm: { name, rating, goals, assists, avatar } | null, accent, competition, dateText, details[], footer, talkingPoint }
function recapGraphic(d) {
  const W = 1600;
  const H = 900;
  const accent = hex(d.accent);
  const res = RESULT_STYLE[d.result] || RESULT_STYLE.draw;
  const motm = d.motm;
  const players = (d.players || []).slice(0, 11);
  const nameSize = (t) => fit(t, 360, 44, 0.5, 20);

  // Player table on the right
  const tx = 560;
  const tw = W - 60 - tx;
  const rowH = Math.min(52, Math.floor(560 / Math.max(players.length, 1)));
  const colX = [];
  let cx = tx + tw;
  for (let i = BOX_COLUMNS.length - 1; i >= 0; i--) {
    colX[i] = cx - BOX_COLUMNS[i][1] / 2 - 10;
    cx -= BOX_COLUMNS[i][1];
  }
  const header = BOX_COLUMNS.map(
    ([label], i) =>
      `<text x="${colX[i]}" y="318" text-anchor="middle" font-family="${HEAD}" font-weight="500" font-size="22" letter-spacing="1" fill="#94a3b8">${label}</text>`,
  ).join('');
  const rows = players
    .map((p, r) => {
      const y = 330 + r * rowH;
      const mid = y + rowH / 2 + 8;
      const cells = BOX_COLUMNS.map(
        ([, , get], i) =>
          `<text x="${colX[i]}" y="${mid}" text-anchor="middle" font-family="${BODY}" font-weight="${i === 0 ? 700 : 400}" font-size="22" fill="${i === 0 ? '#facc15' : '#e2e8f0'}">${esc(get(p))}</text>`,
      ).join('');
      return `${r % 2 ? '' : `<rect x="${tx}" y="${y}" width="${tw}" height="${rowH}" fill="rgba(255,255,255,0.04)"/>`}
        <text x="${tx + 20}" y="${mid}" font-family="${BODY}" font-weight="700" font-size="22" fill="#fff">${esc(clip(p.name, 18))}</text>
        <text x="${tx + 260}" y="${mid}" font-family="${BODY}" font-size="18" fill="#94a3b8">${esc(p.position || '')}${p.motm ? '  MOTM' : ''}${p.red ? '  RED' : ''}</text>
        ${cells}`;
    })
    .join('');

  const details = (d.details || []).filter(Boolean).slice(0, 3);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1220"/><stop offset="0.6" stop-color="#111827"/><stop offset="1" stop-color="${shade(d.accent, -0.55)}"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${shade(d.accent, 0.35)}"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="8" fill="url(#bar)"/>

  ${crest(110, 140, 70, d.crestFor, d.clubName, accent)}
  <text x="200" y="130" font-family="${HEAD}" font-weight="700" font-size="${nameSize(d.clubName)}" fill="#fff">${esc(clip(d.clubName, 26).toUpperCase())}</text>
  <text x="200" y="172" font-family="${HEAD}" font-weight="500" font-size="22" letter-spacing="4" fill="#94a3b8">FULL TIME${d.competition ? ` · ${esc(d.competition.toUpperCase())}` : ''}</text>
  <text x="${W / 2 - 40}" y="190" text-anchor="end" font-family="${HEAD}" font-weight="700" font-size="140" fill="#fff">${Number(d.scoreFor) || 0}</text>
  <rect x="${W / 2 - 18}" y="134" width="36" height="12" rx="4" fill="#64748b"/>
  <text x="${W / 2 + 40}" y="190" font-family="${HEAD}" font-weight="700" font-size="140" fill="#fff">${Number(d.scoreAgainst) || 0}</text>
  <rect x="${W / 2 - 70}" y="210" width="140" height="38" rx="8" fill="${res.color}"/>
  <text x="${W / 2}" y="238" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="24" letter-spacing="3" fill="#0b1220">${res.label}</text>
  ${crest(W - 110, 140, 70, d.crestAgainst, d.opponentName, '#475569')}
  <text x="${W - 200}" y="130" text-anchor="end" font-family="${HEAD}" font-weight="700" font-size="${nameSize(d.opponentName)}" fill="#fff">${esc(clip(d.opponentName, 26).toUpperCase())}</text>
  ${d.dateText ? `<text x="${W - 200}" y="172" text-anchor="end" font-family="${BODY}" font-size="20" fill="#94a3b8">${esc(d.dateText)}</text>` : ''}

  <rect x="60" y="290" width="460" height="${H - 290 - 80}" rx="18" fill="rgba(255,255,255,0.05)"/>
  <text x="90" y="335" font-family="${HEAD}" font-weight="500" font-size="22" letter-spacing="4" fill="${accent}">MAN OF THE MATCH</text>
  ${
    motm
      ? `${crest(160, 430, 62, motm.avatar, motm.name, accent)}
    <text x="245" y="420" font-family="${HEAD}" font-weight="700" font-size="${fit(motm.name, 250, 36, 0.5, 18)}" fill="#fff">${esc(clip(motm.name, 18))}</text>
    <text x="245" y="460" font-family="${BODY}" font-size="22" fill="#cbd5e1">${[motm.rating ? `${Number(motm.rating).toFixed(1)} rating` : null, motm.goals ? `${motm.goals}G` : null, motm.assists ? `${motm.assists}A` : null].filter(Boolean).join(' · ')}</text>`
      : `<text x="90" y="430" font-family="${BODY}" font-size="24" fill="#94a3b8">Not recorded</text>`
  }
  <line x1="90" y1="530" x2="490" y2="530" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
  <text x="90" y="575" font-family="${HEAD}" font-weight="500" font-size="22" letter-spacing="4" fill="${accent}">MATCH DETAILS</text>
  ${details.map((t, i) => `<text x="90" y="${618 + i * 36}" font-family="${BODY}" font-size="22" fill="#e2e8f0">${esc(clip(t, 34))}</text>`).join('')}
  ${wrap(d.talkingPoint, 34, 2)
    .map(
      (line, i) =>
        `<text x="90" y="${618 + details.length * 36 + 30 + i * 30}" font-family="${BODY}" font-weight="700" font-size="22" fill="#fff">${esc(line)}</text>`,
    )
    .join('')}

  <rect x="${tx}" y="290" width="${tw}" height="${H - 290 - 80}" rx="18" fill="rgba(255,255,255,0.05)"/>
  <text x="${tx + 20}" y="318" font-family="${HEAD}" font-weight="500" font-size="22" letter-spacing="1" fill="#94a3b8">PLAYER</text>
  ${header}
  ${rows}
  <text x="60" y="${H - 28}" font-family="${HEAD}" font-weight="700" font-size="30" fill="#fff">POWERED BY <tspan fill="${accent}">GAFFERBOT</tspan></text>
  <text x="${W - 60}" y="${H - 30}" text-anchor="end" font-family="${BODY}" font-size="18" fill="#64748b">${esc(clip(d.footer || '', 60))}</text>
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
    <text x="${x + 56}" y="${y + 90}" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="64" fill="${t.ink}">${Number(card.overall) || '–'}</text>
    <text x="${x + 56}" y="${y + 126}" text-anchor="middle" font-family="${HEAD}" font-weight="500" font-size="28" fill="${t.ink}">${esc(card.position || '')}</text>
    ${card.inForm ? `<text x="${x + 56}" y="${y + 156}" text-anchor="middle" font-family="${HEAD}" font-weight="500" font-size="14" letter-spacing="1" fill="${t.ink}">IN FORM</text>` : ''}
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
      const face = p.avatar
        ? `<clipPath id="${id}"><circle cx="${x}" cy="${y - 20}" r="52"/></clipPath><image href="${p.avatar}" x="${x - 52}" y="${y - 72}" width="104" height="104" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`
        : `<text x="${x}" y="${y}" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="40" fill="#fff">${esc(initials(p.name))}</text>`;
      return `<circle cx="${x}" cy="${y - 20}" r="58" fill="${ac}" stroke="#fff" stroke-width="4"/>
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
