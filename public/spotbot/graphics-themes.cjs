// Studio themes for full-bleed graphics (match poster, lineup, banner, and the Ultra Esports and
// Obsidian cards). The artwork fills the frame; each theme owns its colour grade, frame, headline
// lettering and panels so no two styles look alike. Every word is still drawn from saved data.
const HEAD = 'Oswald';
const BODY = 'Inter';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const seeded = (n) => Array.from({ length: n }, (_, i) => [((i * 7919) % 997) / 997, ((i * 104729) % 991) / 991, ((i * 1299709) % 983) / 983]);

// Shared lettering helpers: a theme picks how its headline is lettered.
function skewed(text, x, y, size, anchor, fill, shadow, skew) {
  return `<g transform="translate(${x} ${y}) skewX(${skew})"><text text-anchor="${anchor}" font-family="${HEAD}" font-weight="700" font-size="${size}" fill="${shadow}" transform="translate(6 7)">${text}</text>
    <text text-anchor="${anchor}" font-family="${HEAD}" font-weight="700" font-size="${size}" fill="${fill}">${text}</text></g>`;
}

function theme(style, accent = '#22c55e') {
  const T = THEMES[style] || THEMES.esports;
  const a = T.fixedAccent || accent;
  return { key: THEMES[style] ? style : 'esports', ...T, accent: a, accentInk: T.accentInk || '#000000', wordInk: T.wordInk || a };
}

const THEMES = {
  // Ultra Esports: punchy contrast, neon kit-colour edge light, smoke glow and a hype slash behind the name.
  esports: {
    ink: '#ffffff', sub: '#e5e7eb', plateInk: '#ffffff', plateSub: '#d1d5db',
    defs: (a) => `<filter id="thGrade"><feComponentTransfer><feFuncR type="linear" slope="1.18" intercept="-0.05"/><feFuncG type="linear" slope="1.18" intercept="-0.05"/><feFuncB type="linear" slope="1.18" intercept="-0.05"/></feComponentTransfer><feColorMatrix type="saturate" values="1.25"/></filter>
      <linearGradient id="thEdge" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${a}" stop-opacity="0.45"/><stop offset="0.1" stop-color="${a}" stop-opacity="0"/><stop offset="0.9" stop-color="${a}" stop-opacity="0"/><stop offset="1" stop-color="${a}" stop-opacity="0.45"/></linearGradient>
      <radialGradient id="thSmoke" cx="0.5" cy="1" r="0.7"><stop stop-color="${a}" stop-opacity="0.45"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></radialGradient>`,
    under: (W, H, a) => `<rect width="${W}" height="${H}" fill="url(#thEdge)"/><rect y="${H * 0.55}" width="${W}" height="${H * 0.45}" fill="url(#thSmoke)"/>`,
    decor: (W, H, a) => `${seeded(90).map(([x, y, r]) => `<circle cx="${(x * W).toFixed(0)}" cy="${(y * H).toFixed(0)}" r="${(r * 2.4 + 0.4).toFixed(1)}" fill="#ffffff" opacity="${(0.05 + r * 0.12).toFixed(2)}"/>`).join('')}
      <path d="M0 0 H${W * 0.42} L${W * 0.36} 14 H0 Z" fill="${a}"/><path d="M${W} ${H} H${W * 0.58} L${W * 0.64} ${H - 14} H${W} Z" fill="${a}"/>`,
    slash: (x, y, w, h, a) => `<path d="M${x - 30} ${y + h} L${x + 30} ${y} H${x + w + 40} L${x + w - 20} ${y + h} Z" fill="${a}" opacity="0.32"/>`,
    head: (t, x, y, s, anchor, th) => skewed(t, x, y, s, anchor, '#ffffff', th.accent, -9),
    plate: (x, y, w, h, th) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#000000" fill-opacity="0.5"/><rect x="${x}" y="${y}" width="8" height="${h}" fill="${th.accent}"/>`,
  },
  // Modern Broadcast: clean TV graphics: scanlines, live bug, glass lower-thirds and a telemetry rail.
  modern: {
    ink: '#ffffff', sub: '#cbd5e1', plateInk: '#ffffff', plateSub: '#cbd5e1',
    defs: () => '<pattern id="thScan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#ffffff" opacity="0.045"/></pattern>',
    under: (W, H) => `<rect width="${W}" height="${H}" fill="url(#thScan)"/>`,
    decor: (W, H, a) => `<g transform="translate(${W / 2 - 95} 46)"><rect width="190" height="44" rx="22" fill="#0b1220" fill-opacity="0.85" stroke="#ffffff" stroke-opacity="0.25"/><circle cx="26" cy="22" r="8" fill="#ef4444"/><text x="46" y="30" font-family="${HEAD}" font-weight="700" font-size="22" letter-spacing="3" fill="#ffffff">LIVE · HD</text></g>
      <g opacity="0.5">${Array.from({ length: 41 }, (_, i) => `<rect x="${60 + i * ((W - 120) / 40)}" y="${H - 34}" width="2" height="${i % 5 ? 8 : 16}" fill="#ffffff"/>`).join('')}</g>
      <rect x="60" y="${H - 22}" width="${(W - 120) * 0.62}" height="3" fill="${a}"/>`,
    slash: () => '',
    head: (t, x, y, s, anchor, th) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${HEAD}" font-weight="700" font-size="${s * 0.92}" fill="#ffffff">${t}</text><rect x="${anchor === 'middle' ? x - 70 : x + 4}" y="${y + 14}" width="140" height="5" fill="${th.accent}"/>`,
    plate: (x, y, w, h, th) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#0b1220" fill-opacity="0.72" stroke="#ffffff" stroke-opacity="0.18"/><rect x="${x}" y="${y}" width="${Math.min(w, 160)}" height="5" fill="${th.accent}"/>`,
  },
  // Vintage Heritage: sepia lithograph with halftone dots inside a cream trade-card border.
  vintage: {
    ink: '#f5e9cf', sub: '#e8d9b5', plateInk: '#2b1d12', plateSub: '#6b5236', fixedAccent: '#a8432f', accentInk: '#f5e9cf', wordInk: '#f0c9a0',
    defs: () => `<filter id="thGrade"><feColorMatrix type="matrix" values="0.42 0.6 0.16 0 0.05  0.34 0.56 0.14 0 0.03  0.25 0.42 0.11 0 0  0 0 0 1 0"/></filter>
      <pattern id="thDots" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.2" fill="#2b1d12" opacity="0.22"/></pattern>`,
    under: (W, H) => `<rect width="${W}" height="${H}" fill="url(#thDots)"/>`,
    decor: (W, H, a) => `<path fill-rule="evenodd" d="M0 0 H${W} V${H} H0 Z M34 34 V${H - 34} H${W - 34} V34 Z" fill="#efe3c8"/>
      <rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="#2b1d12" stroke-width="5"/><rect x="46" y="46" width="${W - 92}" height="${H - 92}" fill="none" stroke="${a}" stroke-width="2" stroke-dasharray="3 6"/>
      ${[[52, 52], [W - 52, 52], [52, H - 52], [W - 52, H - 52]].map(([x, y]) => `<text x="${x}" y="${y + 9}" text-anchor="middle" font-family="${BODY}" font-size="20" fill="#2b1d12">◆</text>`).join('')}`,
    slash: () => '',
    head: (t, x, y, s, anchor) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${HEAD}" font-weight="700" font-size="${s * 0.9}" letter-spacing="6" fill="#f5e9cf" stroke="#2b1d12" stroke-width="4" paint-order="stroke">${t}</text>`,
    plate: (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f3e8cf" fill-opacity="0.94" stroke="#2b1d12" stroke-width="3"/><rect x="${x + 7}" y="${y + 7}" width="${w - 14}" height="${h - 14}" fill="none" stroke="#a8432f" stroke-width="1.5"/>`,
  },
  // Cyber Glitch: magenta/yellow duotone, data grid, warning tape and glitch-offset lettering.
  cyber: {
    ink: '#f4f4f5', sub: '#ff2bd6', plateInk: '#e8ff3a', plateSub: '#f4f4f5', fixedAccent: '#e8ff3a',
    defs: () => `<filter id="thGrade"><feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="0.05 1"/><feFuncG type="table" tableValues="0.01 0.3"/><feFuncB type="table" tableValues="0.12 0.84"/></feComponentTransfer></filter>
      <pattern id="thGrid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0 H0 V32" fill="none" stroke="#e8ff3a" stroke-opacity="0.1"/></pattern>
      <pattern id="thTape" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="20" height="40" fill="#e8ff3a"/><rect x="20" width="20" height="40" fill="#050507"/></pattern>`,
    under: (W, H) => `<rect width="${W}" height="${H}" fill="url(#thGrid)"/>${[0.28, 0.47, 0.61].map((y, i) => `<rect y="${(H * y).toFixed(0)}" width="${W}" height="${[18, 8, 26][i]}" fill="#ff2bd6" opacity="0.22"/>`).join('')}`,
    decor: (W, H) => `<path d="M30 30 H${W - 90} L${W - 30} 90 V${H - 30} H90 L30 ${H - 90} Z" fill="none" stroke="#e8ff3a" stroke-width="4"/>
      <g stroke="#ff2bd6" stroke-width="2" fill="none"><circle cx="${W - 150}" cy="260" r="40"/><path d="M${W - 150} 204 V316 M${W - 206} 260 H${W - 94}"/></g>
      ${Array.from({ length: 22 }, (_, i) => `<rect x="${W - 300 + i * 9}" y="60" width="${(i * 7) % 3 + 2}" height="26" fill="#f4f4f5" opacity="0.7"/>`).join('')}`,
    slash: (x, y, w) => `<rect x="30" y="${y - 40}" width="${w + x}" height="22" fill="url(#thTape)"/>`,
    head: (t, x, y, s, anchor) => `<text x="${x + 7}" y="${y}" text-anchor="${anchor}" font-family="${HEAD}" font-weight="700" font-size="${s}" fill="#ff2bd6" opacity="0.85">${t}</text><text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${HEAD}" font-weight="700" font-size="${s}" fill="#e8ff3a">${t}</text>`,
    plate: (x, y, w, h) => `<path d="M${x} ${y} H${x + w - 24} L${x + w} ${y + 24} V${y + h} H${x + 24} L${x} ${y + h - 24} Z" fill="#050507" fill-opacity="0.78" stroke="#e8ff3a" stroke-width="2"/>`,
  },
  // Liquid Chrome: cool polished grade, iridescent bevelled frame, glass sheen and frosted plaques.
  chrome: {
    ink: '#ffffff', sub: '#f4b8ff', plateInk: '#ffffff', plateSub: '#c8d2e0', fixedAccent: '#9fe8ff',
    defs: () => `<filter id="thGrade"><feColorMatrix type="saturate" values="0.7"/><feComponentTransfer><feFuncB type="linear" slope="1.12"/></feComponentTransfer></filter>
      <linearGradient id="thIris" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#9fe8ff"/><stop offset="0.25" stop-color="#ffffff"/><stop offset="0.5" stop-color="#f4b8ff"/><stop offset="0.75" stop-color="#c8d2e0"/><stop offset="1" stop-color="#9fe8ff"/></linearGradient>
      <linearGradient id="thSheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0.3" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.42" stop-color="#ffffff" stop-opacity="0.16"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`,
    under: (W, H) => `<rect width="${W}" height="${H}" fill="url(#thSheen)"/>`,
    decor: (W, H) => `<path fill-rule="evenodd" d="M0 0 H${W} V${H} H0 Z M40 90 Q40 40 90 40 H${W - 90} Q${W - 40} 40 ${W - 40} 90 V${H - 90} Q${W - 40} ${H - 40} ${W - 90} ${H - 40} H90 Q40 ${H - 40} 40 ${H - 90} Z" fill="#0b0f17"/>
      <rect x="24" y="24" width="${W - 48}" height="${H - 48}" rx="62" fill="none" stroke="url(#thIris)" stroke-width="14"/><rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="50" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="2"/>`,
    slash: () => '',
    head: (t, x, y, s, anchor) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${HEAD}" font-weight="700" font-size="${s}" fill="url(#thIris)" stroke="#ffffff" stroke-opacity="0.5" stroke-width="1.5">${t}</text>`,
    plate: (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="#ffffff" fill-opacity="0.13" stroke="url(#thIris)" stroke-width="3"/><rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${Math.min(46, h / 3)}" rx="26" fill="#ffffff" opacity="0.1"/>`,
  },
  // Tournament MVP: warm high-contrast grade, carbon-fibre border and brushed-gold slashes.
  mvp: {
    ink: '#f7e7b4', sub: '#bfb59a', plateInk: '#f7e7b4', plateSub: '#bfb59a', fixedAccent: '#d8b25a',
    defs: () => `<filter id="thGrade"><feComponentTransfer><feFuncR type="linear" slope="1.15" intercept="0.02"/><feFuncG type="linear" slope="1.08"/><feFuncB type="linear" slope="0.92"/></feComponentTransfer></filter>
      <pattern id="thCarbon" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#0b0b0b"/><rect width="6" height="6" fill="#181818"/><rect x="6" y="6" width="6" height="6" fill="#181818"/></pattern>
      <linearGradient id="thGold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7a5a1d"/><stop offset="0.3" stop-color="#f3d98d"/><stop offset="0.55" stop-color="#d8b25a"/><stop offset="0.8" stop-color="#fff2c4"/><stop offset="1" stop-color="#8c6a26"/></linearGradient>`,
    under: () => '',
    decor: (W, H) => `<path fill-rule="evenodd" d="M0 0 H${W} V${H} H0 Z M30 30 V${H - 30} H${W - 90} L${W - 30} ${H - 90} V30 Z" fill="url(#thCarbon)"/>
      <path d="M30 30 V${H - 30} H${W - 90} L${W - 30} ${H - 90} V30 Z" fill="none" stroke="url(#thGold)" stroke-width="6"/>
      <path d="M0 ${H * 0.62} L${W} ${H * 0.5} V${H * 0.5 + 22} L0 ${H * 0.62 + 22} Z" fill="url(#thGold)" opacity="0.5"/><path d="M0 ${H * 0.66} L${W} ${H * 0.54} V${H * 0.54 + 8} L0 ${H * 0.66 + 8} Z" fill="url(#thGold)" opacity="0.3"/>
      <g transform="translate(${W / 2 - 95} 30)"><rect width="190" height="40" fill="url(#thGold)"/><text x="95" y="28" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="22" letter-spacing="4" fill="#0a0a0a">ELITE TIER</text></g>`,
    slash: () => '',
    head: (t, x, y, s, anchor) => skewed(t, x, y, s, anchor, 'url(#thGold)', '#000000', -4),
    plate: (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#thCarbon)" fill-opacity="0.85" stroke="url(#thGold)" stroke-width="3"/>`,
  },
  // Synthwave Chill: dusk-pink grade, neon horizon grid, glowing sunset frame and neon lettering.
  synthwave: {
    ink: '#fff6fb', sub: '#3ef0ff', plateInk: '#fff6fb', plateSub: '#f8bfe0', fixedAccent: '#ff4fb8',
    defs: () => `<filter id="thGrade"><feColorMatrix type="matrix" values="0.75 0.2 0.15 0 0.08  0.15 0.55 0.15 0 0  0.25 0.2 0.85 0 0.1  0 0 0 1 0"/></filter>
      <linearGradient id="thDusk" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#3ef0ff" stop-opacity="0.12"/><stop offset="0.5" stop-color="#ff4fb8" stop-opacity="0"/><stop offset="0.85" stop-color="#ff4fb8" stop-opacity="0.28"/><stop offset="1" stop-color="#ffb347" stop-opacity="0.4"/></linearGradient>
      <linearGradient id="thNeon" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#3ef0ff"/><stop offset="1" stop-color="#ff4fb8"/></linearGradient>
      <filter id="thGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
    under: (W, H) => `<rect width="${W}" height="${H}" fill="url(#thDusk)"/>
      <g stroke="#3ef0ff" stroke-width="2" opacity="0.35">${Array.from({ length: 15 }, (_, i) => `<path d="M${W / 2 + (i - 7) * 50} ${H * 0.82} L${W / 2 + (i - 7) * 240} ${H}"/>`).join('')}${[0, 1, 2, 3, 4].map((i) => `<path d="M0 ${(H * 0.82 + i * i * 9 + i * 14).toFixed(0)} H${W}"/>`).join('')}</g>`,
    decor: (W, H) => `<rect x="32" y="32" width="${W - 64}" height="${H - 64}" rx="26" fill="none" stroke="url(#thNeon)" stroke-width="6" filter="url(#thGlow)"/>`,
    slash: () => '',
    head: (t, x, y, s, anchor) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${HEAD}" font-weight="700" font-style="italic" font-size="${s}" fill="url(#thNeon)" filter="url(#thGlow)">${t}</text>`,
    plate: (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="#140b2e" fill-opacity="0.6" stroke="url(#thNeon)" stroke-width="2.5"/>`,
  },
  // Mud & Tears 1982: washed-out rainy grade, mud splats, a dented taped frame and paper labels.
  sunday: {
    ink: '#f2ead8', sub: '#c9bfa8', plateInk: '#2b2118', plateSub: '#5b4a33', fixedAccent: '#8a6a3b', accentInk: '#f2ead8', wordInk: '#e0c896',
    defs: () => '<filter id="thGrade"><feColorMatrix type="saturate" values="0.45"/><feComponentTransfer><feFuncR type="linear" slope="0.9"/><feFuncB type="linear" slope="1.06"/></feComponentTransfer></filter>',
    under: (W, H) => `<rect width="${W}" height="${H}" fill="#5d6670" opacity="0.16"/>${seeded(80).map(([x, y]) => `<path d="M${(x * W).toFixed(0)} ${(y * H).toFixed(0)} l-14 46" stroke="#dfe7ee" stroke-opacity="0.2" stroke-width="2"/>`).join('')}`,
    decor: (W, H) => `<path fill-rule="evenodd" d="M0 0 H${W} V${H} H0 Z M44 40 H${W - 40} L${W - 48} ${H - 44} L50 ${H - 36} Z" fill="#2b2a26"/>
      <path d="M44 40 H${W - 40} L${W - 48} ${H - 44} L50 ${H - 36} Z" fill="none" stroke="#3a3630" stroke-width="12"/><path d="M44 40 H${W - 40} L${W - 48} ${H - 44} L50 ${H - 36} Z" fill="none" stroke="#8a6a3b" stroke-width="3" stroke-dasharray="40 10 4 10"/>
      <rect x="14" y="62" width="120" height="34" fill="#e8dcb8" opacity="0.8" transform="rotate(-24 74 79)"/><rect x="${W - 140}" y="${H - 96}" width="120" height="34" fill="#e8dcb8" opacity="0.8" transform="rotate(-18 ${W - 80} ${H - 79})"/>
      ${[[0.1, 0.8, 50], [0.88, 0.84, 40], [0.78, 0.22, 24], [0.2, 0.3, 18]].map(([x, y, r]) => `<circle cx="${(x * W).toFixed(0)}" cy="${(y * H).toFixed(0)}" r="${r}" fill="#4a3a26" opacity="0.85"/><circle cx="${(x * W + r).toFixed(0)}" cy="${(y * H - r * 0.4).toFixed(0)}" r="${r * 0.3}" fill="#4a3a26" opacity="0.8"/>`).join('')}`,
    slash: () => '',
    head: (t, x, y, s, anchor) => `<g transform="rotate(-1.5 ${x} ${y})"><text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${HEAD}" font-weight="700" font-size="${s * 0.9}" fill="#f2ead8" stroke="#2b2118" stroke-width="5" paint-order="stroke">${t}</text></g>`,
    plate: (x, y, w, h) => `<g transform="rotate(-0.8 ${x + w / 2} ${y + h / 2})"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e8dcb8"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#4a3a26" opacity="0.08"/></g>`,
  },
  // Obsidian & Gold: monochrome art toned to black and gold, art-deco double frame and gold lettering.
  obsidian: {
    ink: '#f6e7b0', sub: '#d6d3d1', plateInk: '#f6e7b0', plateSub: '#d6d3d1', fixedAccent: '#d4af37',
    defs: () => `<filter id="thGrade"><feColorMatrix type="matrix" values="0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0.3 0.59 0.11 0 0  0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="0.02 0.62 1"/><feFuncG type="table" tableValues="0.02 0.5 0.93"/><feFuncB type="table" tableValues="0.02 0.28 0.72"/></feComponentTransfer></filter>
      <linearGradient id="thGold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8a6a1f"/><stop offset="0.35" stop-color="#f6e7b0"/><stop offset="0.6" stop-color="#d4af37"/><stop offset="1" stop-color="#8a6a1f"/></linearGradient>`,
    under: (W, H) => `<g stroke="#d4af37" stroke-opacity="0.22" stroke-width="2">${Array.from({ length: 13 }, (_, i) => `<path d="M${W / 2} -40 L${W / 2 + (i - 6) * 120} ${H * 0.22}"/>`).join('')}</g>`,
    decor: (W, H) => `<rect x="22" y="22" width="${W - 44}" height="${H - 44}" fill="none" stroke="url(#thGold)" stroke-width="8"/><rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="#d4af37" stroke-width="2"/>
      ${[[40, 40], [W - 40, 40], [40, H - 40], [W - 40, H - 40]].map(([x, y]) => `<path d="M${x} ${y - 22} L${x + 22} ${y} L${x} ${y + 22} L${x - 22} ${y} Z" fill="#0a0a0a" stroke="url(#thGold)" stroke-width="3"/>`).join('')}`,
    slash: () => '',
    head: (t, x, y, s, anchor) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${HEAD}" font-weight="700" font-size="${s * 0.92}" letter-spacing="4" fill="url(#thGold)">${t}</text>`,
    plate: (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#000000" fill-opacity="0.66"/><rect x="${x}" y="${y}" width="${w}" height="2" fill="url(#thGold)"/><rect x="${x}" y="${y + h - 2}" width="${w}" height="2" fill="url(#thGold)"/>`,
  },
};

// Opening of a full-bleed themed graphic: graded art filling the frame, a light fade only where text sits.
function themeOpen(th, W, H, art, { fadeFrom = 0.58 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${th.defs(th.accent)}
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="${fadeFrom}" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.86"/></linearGradient>
    <linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="0.16" stop-color="#000" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#050505"/>
  ${art ? `<image href="${art}" width="${W}" height="${H}" preserveAspectRatio="xMidYMin slice"${/id="thGrade"/.test(th.defs(th.accent)) ? ' filter="url(#thGrade)"' : ''}/>` : ''}
  ${th.under(W, H, th.accent)}
  <rect width="${W}" height="${H}" fill="url(#fade)"/><rect width="${W}" height="${H}" fill="url(#top)"/>
  ${th.decor(W, H, th.accent)}`;
}

module.exports = { theme, themeOpen, THEME_STYLES: Object.keys(THEMES), esc };
