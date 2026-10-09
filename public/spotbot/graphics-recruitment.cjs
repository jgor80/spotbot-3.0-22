// Recruitment lettering is editable and rendered locally, never invented in AI art.
// Each style family owns its frame, type and colour treatment; the composition picks one of three layouts.
const FAMILY = {
  modern: 'broadcast', esports: 'broadcast', obsidian: 'gold', mvp: 'gold',
  vintage: 'vintage', sicilia: 'sicilia', retro1960s: 'vintage', retro1970s: 'seventies', retro1986: 'eighties',
  retro1990s: 'nineties', y2k: 'chrome', retro2010s: 'chrome', retro2020s: 'prism', chrome: 'chrome',
  cyber: 'cyber', synthwave: 'synthwave', sunday: 'sunday',
};
const THEMES = {
  broadcast: { bg: '#060b16', ink: '#ffffff', sub: '#c7d2e0', head: 'Oswald', tag: 'NOW SIGNING · LIVE', paper: false },
  gold: { bg: '#0b0a08', ink: '#f6e7b8', sub: '#bfae85', accent: '#d4af37', head: 'Oswald', tag: 'ELITE TRIALS OPEN', paper: false },
  vintage: { bg: '#efe4cc', ink: '#221d1b', sub: '#5b4e44', head: 'Oswald', tag: 'EST. CLUB · TRIALS', paper: true },
  sicilia: { bg: '#f1e6cf', ink: '#1b1414', sub: '#6b5544', accent: '#c94f86', gold: '#b58b2a', head: 'Oswald', tag: 'SICILIA · CERCASI GIOCATORI', paper: true },
  seventies: { bg: '#f3e2bd', ink: '#3a1f12', sub: '#7a4a2a', accent2: '#e2862f', head: 'Oswald', tag: '★ NOW RECRUITING ★', paper: true },
  eighties: { bg: '#ffffff', ink: '#101010', sub: '#444444', head: 'Oswald', tag: 'TRYOUTS', paper: false },
  nineties: { bg: '#141414', ink: '#ffffff', sub: '#d8d8d8', accent2: '#2fd2c8', head: 'Oswald', tag: 'WANTED', paper: false },
  chrome: { bg: '#0c1018', ink: '#f4f8ff', sub: '#b6c2d6', head: 'Oswald', tag: 'REFRACTOR EDITION · JOIN', paper: false },
  prism: { bg: '#0e0718', ink: '#ffffff', sub: '#d8c6f5', accent2: '#5ef0ff', head: 'Oswald', tag: 'PRISM DRAFT · OPEN', paper: false },
  cyber: { bg: '#050505', ink: '#f7ff3c', sub: '#ffffff', accent: '#ff2bd6', head: 'Oswald', tag: '// SIGNAL: RECRUITING', paper: false },
  synthwave: { bg: '#1a0b2e', ink: '#ffe6f4', sub: '#f7b6d8', accent2: '#ffb36b', head: 'Oswald', tag: 'NIGHT DRIVE TRIALS', paper: false },
  sunday: { bg: '#5d6466', ink: '#f3efe2', sub: '#d8d2bf', accent2: '#6b4a2b', head: 'Oswald', tag: 'SUNDAY LEAGUE · ANYONE?', paper: false },
};

function frame(f, t, a, W, H) {
  const a2 = t.accent2 || a;
  switch (f) {
    case 'broadcast': return `<rect x="0" y="0" width="${W}" height="10" fill="${a}"/><rect x="0" y="${H - 10}" width="${W}" height="10" fill="${a}"/><path d="M0 1080 L${W} 1010 L${W} 1030 L0 1100Z" fill="${a}" opacity=".85"/>`;
    case 'gold': return `<defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#7a5c18"/><stop offset=".5" stop-color="#f5d77a"/><stop offset="1" stop-color="#7a5c18"/></linearGradient></defs><rect x="22" y="22" width="${W - 44}" height="${H - 44}" fill="none" stroke="url(#g)" stroke-width="6"/><path d="M0 1060 L${W} 980" stroke="url(#g)" stroke-width="18"/>`;
    case 'vintage': return `<rect x="25" y="25" width="${W - 50}" height="${H - 50}" fill="none" stroke="${t.ink}" stroke-width="4"/><rect x="37" y="37" width="${W - 74}" height="${H - 74}" fill="none" stroke="${a}" stroke-width="2" stroke-dasharray="3 5"/>`;
    case 'sicilia': {
      let tiles = '';
      for (let x = 0; x < W; x += 48) tiles += `<rect x="${x}" y="0" width="48" height="28" fill="${(x / 48) % 2 ? a : t.gold}" opacity=".85"/><rect x="${x}" y="${H - 28}" width="48" height="28" fill="${(x / 48) % 2 ? t.gold : a}" opacity=".85"/>`;
      return `${tiles}<rect x="40" y="46" width="${W - 80}" height="${H - 92}" fill="none" stroke="${t.ink}" stroke-width="3"/><rect x="${W / 2 - 120}" y="1040" width="240" height="34" fill="${t.ink}"/><text x="${W / 2}" y="1065" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="22" letter-spacing="8" fill="${t.bg}">SICILIA</text>`;
    }
    case 'seventies': return `<rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="40" fill="none" stroke="${a}" stroke-width="12"/><rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="30" fill="none" stroke="${a2}" stroke-width="6"/>`;
    case 'eighties': return `<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="${a}" stroke-width="40"/><polygon points="${W - 220},1000 ${W - 40},1000 ${W - 40},1080 ${W - 260},1080" fill="${t.ink}"/>`;
    case 'nineties': {
      let dots = '';
      for (let i = 0; i < 160; i++) dots += `<circle cx="${(i * 97) % W}" cy="${(i * 211) % H}" r="${1 + (i % 3)}" fill="${i % 2 ? a : a2}" opacity=".5"/>`;
      return `${dots}<polygon points="0,1000 ${W},940 ${W},1010 0,1070" fill="${a}"/><polygon points="0,1070 ${W},1010 ${W},1030 0,1090" fill="${a2}"/>`;
    }
    case 'chrome': return `<defs><linearGradient id="rf" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${a}"/><stop offset=".35" stop-color="#edf5ff"/><stop offset=".6" stop-color="#8fd3ff"/><stop offset="1" stop-color="${a}"/></linearGradient></defs><rect x="24" y="24" width="${W - 48}" height="${H - 48}" rx="36" fill="none" stroke="url(#rf)" stroke-width="16"/><circle cx="${W - 120}" cy="1050" r="70" fill="none" stroke="url(#rf)" stroke-width="6"/>`;
    case 'prism': return `<polygon points="0,0 260,0 0,260" fill="${a}" opacity=".7"/><polygon points="${W},${H} ${W - 300},${H} ${W},${H - 300}" fill="${a2}" opacity=".6"/><polygon points="0,1040 ${W},960 ${W},990 0,1070" fill="${a2}"/><polygon points="0,1070 ${W},990 ${W},1004 0,1084" fill="${a}"/>`;
    case 'cyber': return `<path d="M32 250H992M32 1040H992" stroke="${a}" stroke-width="14" stroke-dasharray="24 12"/><g fill="none" stroke="${t.ink}" stroke-width="3"><path d="M40 40h60M40 40v60M984 40h-60M984 40v60M40 1496h60M40 1496v-60M984 1496h-60M984 1496v-60"/></g><rect x="0" y="1000" width="${W}" height="26" fill="${t.ink}" opacity=".9"/>`;
    case 'synthwave': {
      let grid = '';
      for (let y = 1100; y < H; y += 36) grid += `<path d="M0 ${y}H${W}" stroke="${a}" stroke-opacity=".35"/>`;
      for (let x = -400; x < W + 400; x += 80) grid += `<path d="M${W / 2} 1060 L${x} ${H}" stroke="${a}" stroke-opacity=".3"/>`;
      return `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2b0f4c"/><stop offset="1" stop-color="#ff6aa9" stop-opacity=".5"/></linearGradient></defs><rect width="${W}" height="1060" fill="url(#sk)"/>${grid}`;
    }
    case 'sunday': return `<rect x="30" y="30" width="${W - 60}" height="${H - 60}" fill="none" stroke="${t.sub}" stroke-width="5" stroke-dasharray="40 8 12 8"/><rect x="90" y="18" width="140" height="40" fill="#e8dcb0" opacity=".8" transform="rotate(-6 160 38)"/><rect x="${W - 230}" y="${H - 60}" width="140" height="40" fill="#e8dcb0" opacity=".8" transform="rotate(5 ${W - 160} ${H - 40})"/><g fill="${t.accent2}" opacity=".7"><circle cx="120" cy="1450" r="40"/><circle cx="180" cy="1480" r="22"/><circle cx="900" cy="1100" r="28"/></g>`;
    default: return '';
  }
}

function recruitmentPoster(d, G, p) {
  const W = 1024, H = 1536, esc = G.esc;
  const f = FAMILY[d.style] || 'broadcast';
  const t = THEMES[f];
  const accent = t.accent || p.accent || '#e98bb5';
  const layout = ['lower-third', 'editorial', 'side-panel'].includes(d.composition) ? d.composition : 'lower-third';
  const lines = (s, limit = 50) => {
    const out = []; let line = '';
    for (const word of String(s || '').split(/\s+/).filter(Boolean)) {
      if ((line + ' ' + word).trim().length > limit && line) { out.push(line); line = word; }
      else line = (line + ' ' + word).trim();
    }
    if (line) out.push(line);
    return out.slice(0, 3);
  };
  const side = layout === 'side-panel';
  const textW = side ? 400 : 864;
  const fit = (s, max) => Math.min(max, Math.floor(textW / Math.max(String(s).length * 0.56, 1)));
  const details = lines(d.details, side ? 26 : 50);
  const contact = lines(d.contact, side ? 28 : 55).slice(0, 2);
  const headline = String(d.headline || '').toUpperCase();
  const italic = /broadcast|cyber|nineties|prism|eighties/.test(f) ? ' font-style="italic"' : '';
  const spacing = /vintage|sicilia|gold|chrome/.test(f) ? ' letter-spacing="4"' : '';

  // Art rect + text anchor per layout
  const art = layout === 'editorial' ? { x: 50, y: 460, w: 924, h: 580 }
    : side ? { x: 440, y: 230, w: 540, h: 1180 } : { x: 50, y: 250, w: 924, h: 780 };
  const tx = side ? 70 : 80;
  let headY, posY, detY;
  if (layout === 'editorial') { headY = 370; posY = 425; detY = 1180; }
  else if (side) { headY = 420; posY = 500; detY = 600; }
  else { headY = 1150; posY = 1220; detY = contact.length ? 1290 : 1330; }
  const contactY = side ? detY + details.length * 34 + 60 : 1410;
  const headSize = fit(headline, layout === 'editorial' ? 110 : 92);
  const headText = f === 'seventies'
    ? `<defs><path id="arc" d="M80 ${headY + 20} Q512 ${headY - 120} 944 ${headY + 20}"/></defs><text font-family="Oswald" font-weight="700" font-size="${headSize}" fill="${accent}" stroke="${t.ink}" stroke-width="3"><textPath href="#arc" startOffset="50%" text-anchor="middle">${esc(headline)}</textPath></text>`
    : f === 'cyber'
      ? `<text x="${tx + 6}" y="${headY}" font-family="Oswald" font-weight="700" font-size="${headSize}" fill="${accent}" opacity=".8"${italic}>${esc(headline)}</text><text x="${tx}" y="${headY - 4}" font-family="Oswald" font-weight="700" font-size="${headSize}" fill="${t.ink}"${italic}>${esc(headline)}</text>`
      : f === 'synthwave' || f === 'chrome' || f === 'prism'
        ? `<text x="${tx}" y="${headY}" font-family="Oswald" font-weight="700" font-size="${headSize}" fill="none" stroke="${accent}" stroke-width="3"${italic}${spacing}>${esc(headline)}</text><text x="${tx + 3}" y="${headY - 3}" font-family="Oswald" font-weight="700" font-size="${headSize}" fill="${t.ink}"${italic}${spacing}>${esc(headline)}</text>`
        : f === 'sunday'
          ? `<g transform="rotate(-3 ${tx} ${headY})"><rect x="${tx - 14}" y="${headY - headSize}" width="${Math.min(textW + 30, headline.length * headSize * .58 + 30)}" height="${headSize + 18}" fill="#e8dcb0"/><text x="${tx}" y="${headY}" font-family="Oswald" font-weight="700" font-size="${headSize}" fill="#2a2420">${esc(headline)}</text></g>`
          : `<text x="${tx}" y="${headY}" font-family="Oswald" font-weight="700" font-size="${headSize}" fill="${t.ink}"${italic}${spacing}>${esc(headline)}</text>`;
  const crestX = side ? 70 : 66;
  const clubX = d.crest ? crestX + 172 : 80;
  const maskedPanel = side ? '' : `<rect x="50" y="${layout === 'editorial' ? 1080 : 1048}" width="924" height="${layout === 'editorial' ? 380 : 420}" fill="${t.bg}" opacity="${t.paper ? 1 : .88}"/>`;
  const editorialBand = layout === 'editorial' ? `<rect x="50" y="230" width="924" height="190" fill="${t.bg}" opacity=".9"/>` : '';
  return G.render(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${t.bg}"/>
    ${frame(f, t, accent, W, H)}
    ${d.art ? `<image href="${d.art}" x="${art.x}" y="${art.y}" width="${art.w}" height="${art.h}" preserveAspectRatio="xMidYMid meet"/>` : ''}
    ${t.paper && d.art ? `<rect x="${art.x}" y="${art.y}" width="${art.w}" height="${art.h}" fill="#c8a970" opacity=".18"/>` : ''}
    ${maskedPanel}${editorialBand}
    ${d.crest ? `<image href="${d.crest}" x="${crestX}" y="66" width="140" height="140" preserveAspectRatio="xMidYMid meet"/>` : ''}
    <text x="${clubX}" y="142" font-family="Oswald" font-weight="700" font-size="${Math.min(64, Math.floor((W - clubX - 80) / Math.max(d.clubName.length * .56, 1)))}" fill="${t.ink}"${spacing}>${esc(d.clubName.toUpperCase())}</text>
    <text x="${clubX}" y="192" font-family="Inter" font-weight="700" font-size="22" letter-spacing="3" fill="${accent}">${esc(t.tag)}</text>
    ${headText}
    ${d.positions ? `<text x="${tx}" y="${posY}" font-family="Oswald" font-weight="700" font-size="${fit(d.positions, 46)}" fill="${t.accent2 || accent}"${italic}>${esc(d.positions.toUpperCase())}</text>` : ''}
    ${details.map((l, i) => `<text x="${tx}" y="${detY + i * 34}" font-family="Inter" font-size="${fit(l, 27)}" fill="${t.sub}">${esc(l)}</text>`).join('')}
    ${contact.map((l, i) => `<text x="${tx}" y="${contactY + i * 32}" font-family="Inter" font-weight="700" font-size="${fit(l, 25)}" fill="${t.ink}">${esc(l)}</text>`).join('')}
    <text x="512" y="1490" text-anchor="middle" font-family="Inter" font-size="13" fill="${t.sub}">AI VIRTUAL PRO ART · SPOTBOT STUDIO</text>
  </svg>`);
}
module.exports = { recruitmentPoster, FAMILY };
