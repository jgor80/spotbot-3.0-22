// Graphics Studio pick previews: small local composites of the kits, crests and pro photos a member
// is choosing between, shown as the draft message's embed image. Built only from saved assets and
// plain SVG shapes (never the paid art model), so previews are free and instant.
const HEAD = 'Oswald';
const BODY = 'Inter';
const BG = '#0f1115', TILE = '#1b1f27', LINE = '#2b313c', INK = '#f3f4f6', SUB = '#9ca3af', PICK = '#22c55e';

// Kit colour words, including the multi-word names used by the Palermo kit catalog.
const KIT_COLORS = {
  pink: '#f472b6', 'pale pink': '#f9c5d9', 'dark pink': '#db2777', black: '#111111', 'anthracite black': '#2f3237', anthracite: '#2f3237',
  white: '#ffffff', cream: '#f5f0e1', red: '#dc2626', claret: '#7f1d3a', maroon: '#7f1d1d', blue: '#2563eb', 'sky blue': '#38bdf8', sky: '#38bdf8',
  navy: '#1e3a8a', green: '#16a34a', 'lime yellow': '#d9f99d', lime: '#a3e635', yellow: '#facc15', gold: '#d4af37', orange: '#f97316',
  peach: '#fbc4a4', purple: '#7c3aed', teal: '#0d9488', silver: '#c0c4cc', grey: '#9ca3af', gray: '#9ca3af', brown: '#78350f',
};
function kitColor(value, fallback) {
  const s = String(value || '').trim().toLowerCase();
  if (/^#?[0-9a-f]{6}$/.test(s)) return `#${s.replace('#', '')}`;
  if (KIT_COLORS[s]) return KIT_COLORS[s];
  const word = s.split(/\s+/).reverse().find((w) => KIT_COLORS[w]);
  return word ? KIT_COLORS[word] : fallback;
}

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ''));

// A flat shirt-and-shorts drawing in the kit's colours, with bands or stripes when the description has them.
function shirtSvg(cx, top, w, kit) {
  const main = kitColor(kit?.primary, '#6b7280');
  const trim = kitColor(kit?.secondary, main === '#111111' ? '#ffffff' : '#111111');
  const s = w / 100, x = (v) => (cx + (v - 50) * s).toFixed(1), y = (v) => (top + v * s).toFixed(1);
  const desc = String(kit?.description || '').toLowerCase();
  const body = `M${x(30)} ${y(4)} L${x(14)} ${y(10)} L${x(0)} ${y(30)} L${x(12)} ${y(40)} L${x(22)} ${y(32)} L${x(22)} ${y(86)} L${x(78)} ${y(86)} L${x(78)} ${y(32)} L${x(88)} ${y(40)} L${x(100)} ${y(30)} L${x(86)} ${y(10)} L${x(70)} ${y(4)} Q${x(50)} ${y(16)} ${x(30)} ${y(4)} Z`;
  const id = `k${Math.round(cx)}x${Math.round(top)}`;
  const pattern = /band/.test(desc) ? `<rect x="${x(0)}" y="${y(22)}" width="${(100 * s).toFixed(1)}" height="${(9 * s).toFixed(1)}" fill="${trim}"/><rect x="${x(0)}" y="${y(36)}" width="${(100 * s).toFixed(1)}" height="${(9 * s).toFixed(1)}" fill="${trim}"/>`
    : /stripe/.test(desc) && !/sleeve/.test(desc) ? [30, 46, 62].map((v) => `<rect x="${x(v)}" y="${y(0)}" width="${(8 * s).toFixed(1)}" height="${(90 * s).toFixed(1)}" fill="${trim}"/>`).join('')
      : /slash|diagonal/.test(desc) ? `<path d="M${x(22)} ${y(70)} L${x(78)} ${y(30)} L${x(78)} ${y(42)} L${x(22)} ${y(82)} Z" fill="${trim}" fill-opacity="0.8"/>`
        : /side panel|flank/.test(desc) ? `<rect x="${x(22)}" y="${y(32)}" width="${(9 * s).toFixed(1)}" height="${(54 * s).toFixed(1)}" fill="${trim}"/><rect x="${x(69)}" y="${y(32)}" width="${(9 * s).toFixed(1)}" height="${(54 * s).toFixed(1)}" fill="${trim}"/>` : '';
  return `<clipPath id="${id}"><path d="${body}"/></clipPath>
    <path d="${body}" fill="${main}" stroke="#000" stroke-opacity="0.35" stroke-width="${(1.5 * s).toFixed(1)}"/>
    <g clip-path="url(#${id})">${pattern}
      <path d="M${x(0)} ${y(30)} L${x(12)} ${y(40)} L${x(16)} ${y(35)} L${x(4)} ${y(25)} Z M${x(100)} ${y(30)} L${x(88)} ${y(40)} L${x(84)} ${y(35)} L${x(96)} ${y(25)} Z" fill="${trim}"/></g>
    <path d="M${x(30)} ${y(4)} Q${x(50)} ${y(16)} ${x(70)} ${y(4)}" fill="none" stroke="${trim}" stroke-width="${(5 * s).toFixed(1)}"/>
    <path d="M${x(24)} ${y(88)} L${x(76)} ${y(88)} L${x(78)} ${y(108)} L${x(53)} ${y(108)} L${x(50)} ${y(98)} L${x(47)} ${y(108)} L${x(22)} ${y(108)} Z" fill="${trim}" stroke="#000" stroke-opacity="0.35" stroke-width="${(1.5 * s).toFixed(1)}"/>`;
}

function tile(x, y, w, h, picked) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${TILE}" stroke="${picked ? PICK : LINE}" stroke-width="${picked ? 5 : 2}"/>`;
}
function caption(x, y, w, text, size = 15, color = INK) {
  const max = Math.max(8, Math.floor(w / (size * 0.56)));
  return `<text x="${x + w / 2}" y="${y}" text-anchor="middle" font-family="${BODY}" font-weight="700" font-size="${size}" fill="${color}">${esc(clip(text, max))}</text>`;
}
function badge(x, y, text, color = PICK) {
  const w = text.length * 9 + 18;
  return `<rect x="${x}" y="${y}" width="${w}" height="24" rx="12" fill="${color}"/><text x="${x + w / 2}" y="${y + 17}" text-anchor="middle" font-family="${BODY}" font-weight="700" font-size="13" fill="#000">${esc(text)}</text>`;
}
function picture(x, y, w, h, image, id) {
  return image
    ? `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"/></clipPath><image href="${image}" x="${x}" y="${y}" width="${w}" height="${h}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#262b35"/><text x="${x + w / 2}" y="${y + h / 2 + 6}" text-anchor="middle" font-family="${BODY}" font-size="14" fill="${SUB}">No preview</text>`;
}
function heading(x, y, text) {
  return `<text x="${x}" y="${y}" font-family="${HEAD}" font-weight="700" font-size="22" letter-spacing="2" fill="${SUB}">${esc(text)}</text>`;
}

const W = 1200, PAD = 30, GAP = 14;

// Picks for one draft. kits: [{ label, primary, secondary, description, picked, auto }];
// crest: { image, label } | null; photos: [{ n, label, image, picked }] (numbers match the dropdown);
// photoAuto: no photo picked yet; morePhotos: uploads not shown.
function pickSheet({ kits = [], crest = null, photos = [], photoAuto = false, morePhotos = 0 }) {
  const parts = [];
  let y = PAD;
  // Row 1: kits, then the crest at the right.
  const crestW = crest ? 210 : 0;
  const room = W - PAD * 2 - (crest ? crestW + GAP * 3 : 0);
  const kitW = Math.min(200, Math.floor((room - GAP * (Math.max(kits.length, 1) - 1)) / Math.max(kits.length, 1)));
  const rowH = 250;
  parts.push(heading(PAD, y + 20, kits.length > 1 ? 'KITS' : 'KIT'));
  if (crest) parts.push(heading(W - PAD - crestW, y + 20, 'CREST'));
  y += 36;
  kits.forEach((k, i) => {
    const x = PAD + i * (kitW + GAP);
    parts.push(tile(x, y, kitW, rowH, k.picked));
    parts.push(shirtSvg(x + kitW / 2, y + 30, Math.min(kitW - 30, 140), k));
    parts.push(caption(x, y + rowH - 40, kitW, k.label, kitW < 150 ? 13 : 15));
    parts.push(caption(x, y + rowH - 18, kitW, [k.primary, k.secondary].filter(Boolean).join(' / ') || 'colours not set', 12, SUB));
    if (k.picked) parts.push(badge(x + 8, y + 8, k.auto ? 'AUTO' : 'PICKED'));
  });
  if (crest) {
    const x = W - PAD - crestW;
    parts.push(tile(x, y, crestW, rowH, true));
    parts.push(crest.image ? `<image href="${crest.image}" x="${x + 25}" y="${y + 18}" width="${crestW - 50}" height="${crestW - 50}" preserveAspectRatio="xMidYMid meet"/>`
      : `<circle cx="${x + crestW / 2}" cy="${y + 98}" r="70" fill="#262b35"/><text x="${x + crestW / 2}" y="${y + 106}" text-anchor="middle" font-family="${BODY}" font-size="14" fill="${SUB}">Initials badge</text>`);
    parts.push(caption(x, y + rowH - 18, crestW, crest.label, 13));
  }
  y += rowH + GAP * 2;
  // Row 2: the member's uploaded photos, numbered like the dropdown.
  if (photos.length) {
    parts.push(heading(PAD, y + 20, photoAuto ? 'YOUR PHOTOS · AUTOMATIC PICKS THE BEST MATCH' : 'YOUR PHOTOS'));
    y += 36;
    const slots = photos.length + (morePhotos ? 1 : 0);
    const pw = Math.min(180, Math.floor((W - PAD * 2 - GAP * (slots - 1)) / slots)), ph = Math.round(pw * 1.25);
    photos.forEach((p, i) => {
      const x = PAD + i * (pw + GAP);
      parts.push(tile(x, y, pw, ph + 34, p.picked));
      parts.push(picture(x + 6, y + 6, pw - 12, ph - 6, p.image, `p${i}`));
      parts.push(caption(x, y + ph + 24, pw, p.label, 13));
      if (p.picked) parts.push(badge(x + 10, y + 12, 'PICKED'));
    });
    if (morePhotos) {
      const x = PAD + photos.length * (pw + GAP);
      parts.push(tile(x, y, pw, ph + 34, false));
      parts.push(caption(x, y + ph / 2 + 10, pw, `+${morePhotos} more`, 20, SUB));
    }
    y += ph + 34 + GAP * 2;
  }
  return svg(W, y, parts);
}

// Every crest a recruiting poster can use, numbered like the dropdown.
function crestSheet(crests) {
  const list = crests.slice(0, 24);
  const cols = Math.min(8, Math.max(list.length, 1));
  const cw = Math.floor((W - PAD * 2 - GAP * (cols - 1)) / cols), ch = cw + 44;
  const parts = [heading(PAD, PAD + 20, 'CLUB LOGOS')];
  const top = PAD + 36;
  list.forEach((c, i) => {
    const x = PAD + (i % cols) * (cw + GAP), y = top + Math.floor(i / cols) * (ch + GAP);
    parts.push(tile(x, y, cw, ch, false));
    parts.push(c.image ? `<image href="${c.image}" x="${x + 12}" y="${y + 10}" width="${cw - 24}" height="${cw - 24}" preserveAspectRatio="xMidYMid meet"/>`
      : `<text x="${x + cw / 2}" y="${y + cw / 2}" text-anchor="middle" font-family="${BODY}" font-size="13" fill="${SUB}">No preview</text>`);
    parts.push(caption(x, y + cw + 8, cw, `${i + 1}. ${c.years || ''}`.trim(), 14));
    parts.push(caption(x, y + cw + 28, cw, c.label, 11, SUB));
  });
  const rows = Math.ceil(list.length / cols) || 1;
  return svg(W, top + rows * (ch + GAP) + PAD - GAP, parts);
}

function svg(w, h, parts) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${BG}"/>${parts.join('')}</svg>`;
}

// A downscaled copy of an image so previews embed small thumbnails, not full uploads.
function thumbSvg(image, w, h = w, fit = 'slice') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><image href="${image}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid ${fit}"/></svg>`;
}

module.exports = { pickSheet, crestSheet, thumbSvg, shirtSvg, kitColor };
