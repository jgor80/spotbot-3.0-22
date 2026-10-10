// Signature studio cards: broadcast, heritage, esports and synthwave frames.
// Every word and number is drawn here from saved data; artwork is text-free.
const W = 1024, H = 1434;

const THEMES = {
  modern: { bg: '#07101d', ink: '#ffffff', sub: '#a9b8cc', glass: '#0b1626', hi: '#ffffff' },
  vintage: { bg: '#e9dcc0', ink: '#2b1d12', sub: '#6b5236', glass: '#f3e8cf', hi: '#a8432f' },
  cyber: { bg: '#050507', ink: '#f4f4f5', sub: '#9ca3af', glass: '#0d0d12', hi: '#e8ff3a', hi2: '#ff2bd6' },
  chrome: { bg: '#0b0f17', ink: '#ffffff', sub: '#c8d2e0', glass: '#ffffff', hi: '#9fe8ff', hi2: '#f4b8ff' },
  mvp: { bg: '#0a0a0a', ink: '#f7e7b4', sub: '#bfb59a', glass: '#141414', hi: '#d8b25a', hi2: '#f3d98d' },
  sunday: { bg: '#2b2a26', ink: '#f2ead8', sub: '#c9bfa8', glass: '#3a3630', hi: '#8a6a3b', mud: '#4a3a26' },
  synthwave: { bg: '#140b2e', ink: '#fff6fb', sub: '#f8bfe0', glass: '#1d1042', hi: '#ff4fb8', hi2: '#3ef0ff', sun: '#ffb347' },
};

function renderSignatureCard(d, G, accent) {
  const t = THEMES[d.style] || THEMES.modern;
  const esc = G.esc;
  const up = (s, n) => String(s || '').toUpperCase().slice(0, n);
  const name = up(d.name, 40), club = up(d.clubName || 'PRO CLUBS', 40), pos = up(d.position, 12);
  const fit = (s, w, max, r = 0.58) => Math.max(18, Math.min(max, Math.floor(w / Math.max(s.length * r, 1))));
  const stats = (d.stats || []).slice(0, 6);
  const comp = d.composition || 'lower-third';
  const ovr = d.overall ? String(d.overall) : '';
  const crest = (x, y, s, fill = t.ink) => d.crest
    ? `<image href="${d.crest}" x="${x}" y="${y}" width="${s}" height="${s}" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="${x + s / 2}" y="${y + s * 0.66}" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${s * 0.42}" fill="${fill}">${esc(club.slice(0, 3))}</text>`;
  const art = (clip) => d.art ? `<image href="${d.art}" x="0" y="0" width="${W}" height="1340" preserveAspectRatio="xMidYMin slice"${clip ? ` clip-path="url(#${clip})"` : ''}/>` : '';
  const statRow = (y, color, labelColor, mono = false) => stats.map(([l, v], i) => {
    const x = 70 + (884 / stats.length) * (i + 0.5);
    return `<text x="${x}" y="${y}" text-anchor="middle" font-family="${mono ? 'Inter' : 'Oswald'}" font-weight="700" font-size="30" fill="${color}">${esc(v)}</text><text x="${x}" y="${y + 24}" text-anchor="middle" font-family="Inter" font-size="13" letter-spacing="2" fill="${labelColor}">${esc(l)}</text>`;
  }).join('');
  const footer = (fill) => `<text x="512" y="1416" text-anchor="middle" font-family="Inter" font-size="12" letter-spacing="1" fill="${fill}">${stats.length ? 'EA MATCH DATA · ' : ''}AI VIRTUAL PRO ART · GAFFERBOT STUDIO</text>`;
  const tag = d.tagline ? esc(String(d.tagline).slice(0, 60)) : '';
  let body = '';

  if (d.style === 'sunday') {
    // Mud & Tears 1982: rain-streaked art, mud splats, a dented tape-mended frame and a sad paper label.
    const rain = Array.from({ length: 70 }, (_, i) => { const x = (i * 149) % W, y = (i * 263) % 1300; return `<path d="M${x} ${y} l-14 46" stroke="#dfe7ee" stroke-opacity="0.18" stroke-width="2"/>`; }).join('');
    const splats = [[120, 1150, 60], [900, 1180, 46], [780, 330, 28], [200, 420, 22], [560, 1230, 34]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${t.mud}" opacity="0.85"/><circle cx="${x + r}" cy="${y - r * 0.4}" r="${r * 0.3}" fill="${t.mud}" opacity="0.8"/>`).join('');
    const labelY = comp === 'editorial' ? 120 : 1070;
    body = `<defs><filter id="wetS"><feColorMatrix type="saturate" values="0.45"/><feComponentTransfer><feFuncR type="linear" slope="0.9"/><feFuncB type="linear" slope="1.05"/></feComponentTransfer></filter>
      <clipPath id="winS"><path d="M70 70 H950 L944 1260 L76 1268 Z"/></clipPath></defs>
      <rect width="${W}" height="${H}" fill="${t.bg}"/>
      <g clip-path="url(#winS)">${d.art ? `<image href="${d.art}" x="0" y="0" width="${W}" height="1340" preserveAspectRatio="xMidYMin slice" filter="url(#wetS)"/>` : ''}<rect width="${W}" height="1340" fill="#5d6670" opacity="0.18"/>${rain}</g>
      <path d="M70 70 H950 L944 1260 L76 1268 Z" fill="none" stroke="${t.glass}" stroke-width="14"/><path d="M70 70 H950 L944 1260 L76 1268 Z" fill="none" stroke="${t.hi}" stroke-width="3" stroke-dasharray="40 10 4 10"/>
      <rect x="40" y="96" width="120" height="34" fill="#e8dcb8" opacity="0.8" transform="rotate(-24 100 113)"/><rect x="866" y="1210" width="120" height="34" fill="#e8dcb8" opacity="0.8" transform="rotate(-18 926 1227)"/>
      ${splats}
      <g transform="translate(90 ${labelY}) rotate(-1.5)"><rect width="844" height="148" fill="#e8dcb8"/><rect width="844" height="148" fill="${t.mud}" opacity="0.08"/>
        <text x="30" y="90" font-family="Oswald" font-weight="700" font-size="${fit(name, 560, 72, 0.52)}" fill="#2b2118">${esc(name)}</text>
        <text x="32" y="128" font-family="Inter" font-weight="700" font-size="18" letter-spacing="4" fill="#5b4a33">${esc(club)}${pos ? ` · ${esc(pos)}` : ''} · SUNDAY LEAGUE '82</text>
        <g transform="translate(720 18)">${crest(0, 0, 110, '#2b2118')}</g></g>
      <text x="512" y="${labelY - 18}" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="30" letter-spacing="8" fill="${t.ink}" opacity="0.9">MUD &amp; TEARS</text>
      ${tag ? `<text x="512" y="${labelY + 186}" text-anchor="middle" font-family="Inter" font-style="italic" font-size="18" fill="${t.sub}">${tag}</text>` : ''}
      ${stats.length ? `<rect x="70" y="1284" width="884" height="84" fill="${t.glass}"/>${statRow(1324, t.ink, t.sub)}` : ''}
      ${footer(t.sub)}`;
  } else if (d.style === 'modern') {
    // Live TV broadcast: full-bleed art, glass lower-third, live bug, telemetry rail.
    const barY = comp === 'editorial' ? 120 : 1080;
    body = `<defs><linearGradient id="fadeM" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="${t.bg}" stop-opacity="0"/><stop offset="0.93" stop-color="${t.bg}"/></linearGradient>
      <pattern id="scanM" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#ffffff" opacity="0.035"/></pattern></defs>
      <rect width="${W}" height="${H}" fill="${t.bg}"/>${art()}<rect width="${W}" height="1340" fill="url(#fadeM)"/><rect width="${W}" height="1340" fill="url(#scanM)"/>
      <g transform="translate(694 54)"><rect width="276" height="46" rx="23" fill="${t.glass}" fill-opacity="0.82" stroke="${t.hi}" stroke-opacity="0.25"/><circle cx="26" cy="23" r="8" fill="${accent}"/><circle cx="26" cy="23" r="14" fill="none" stroke="${accent}" stroke-opacity="0.45" stroke-width="3"/><text x="48" y="31" font-family="Oswald" font-weight="700" font-size="22" letter-spacing="2" fill="${t.ink}">${esc(fitText(d.competition || 'PRO CLUBS LIVE', 16))}</text></g>
      <g transform="translate(54 ${barY})">
        <path d="M0 0 H880 L916 36 V150 H0 Z" fill="${t.glass}" fill-opacity="0.88" stroke="${t.hi}" stroke-opacity="0.18"/>
        <path d="M0 0 H150 V150 H0 Z" fill="${accent}"/>${crest(25, 25, 100, t.ink)}
        <path d="M150 0 H178 L160 150 H150 Z" fill="${t.bg}" opacity="0.5"/>
        <text x="200" y="88" font-family="Oswald" font-weight="700" font-size="${fit(name, 600, 74, 0.5)}" fill="${t.ink}">${esc(name)}</text>
        <text x="202" y="126" font-family="Inter" font-weight="700" font-size="20" letter-spacing="4" fill="${t.sub}">${esc(club)}${pos ? `  ·  ${esc(pos)}` : ''}</text>
        ${ovr ? `<path d="M812 30 H896 V128 H786 Z" fill="${accent}"/><text x="846" y="98" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="54" fill="${t.ink}">${esc(ovr)}</text>` : ''}
      </g>
      ${tag ? `<text x="70" y="${barY + 186}" font-family="Inter" font-size="18" letter-spacing="2" fill="${t.sub}">${tag}</text>` : ''}
      ${stats.length ? `<g><path d="M54 1292 H970" stroke="${t.hi}" stroke-opacity="0.25"/>${stats.map((_, i) => `<path d="M${70 + (884 / stats.length) * i} 1286 V1298" stroke="${accent}" stroke-width="3"/>`).join('')}${statRow(1340, t.ink, t.sub)}</g>` : ''}
      ${footer(t.sub)}`;
  } else if (d.style === 'vintage') {
    // 1950s cigarette / trade card: halftone lithograph, arched hand-lettered banner, oval inset.
    const arch = comp === 'side-panel' ? 'M150 210 Q512 120 874 210' : 'M130 230 Q512 90 894 230';
    body = `<defs><pattern id="dotV" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.3" fill="${t.ink}" opacity="0.28"/></pattern>
      <filter id="sepiaV"><feColorMatrix type="matrix" values="0.42 0.6 0.16 0 0.04  0.34 0.56 0.14 0 0.02  0.25 0.42 0.11 0 0  0 0 0 1 0"/></filter>
      <clipPath id="winV"><rect x="88" y="250" width="848" height="900" rx="10"/></clipPath><path id="archV" d="${arch}"/></defs>
      <rect width="${W}" height="${H}" fill="${t.bg}"/><rect x="26" y="26" width="972" height="1330" fill="none" stroke="${t.ink}" stroke-width="4"/><rect x="40" y="40" width="944" height="1302" fill="none" stroke="${t.hi}" stroke-width="2" stroke-dasharray="2 6"/>
      <g clip-path="url(#winV)"><rect x="88" y="250" width="848" height="900" fill="${t.sub}"/>${d.art ? `<image href="${d.art}" x="88" y="250" width="848" height="900" preserveAspectRatio="xMidYMin slice" filter="url(#sepiaV)"/>` : ''}
        <rect x="88" y="250" width="848" height="900" fill="${accent}" opacity="0.14" style="mix-blend-mode:multiply"/><rect x="88" y="250" width="848" height="900" fill="url(#dotV)"/></g>
      <rect x="88" y="250" width="848" height="900" rx="10" fill="none" stroke="${t.ink}" stroke-width="5"/><rect x="92" y="254" width="840" height="892" rx="8" fill="none" stroke="${accent}" stroke-width="2" transform="translate(3 2)" opacity="0.6"/>
      <text font-family="Oswald" font-weight="700" font-size="${fit(club, 680, 64, 0.62)}" letter-spacing="6" fill="${t.hi}" stroke="${t.ink}" stroke-width="1.5" paint-order="stroke"><textPath href="#archV" startOffset="50%" text-anchor="middle">${esc(club)}</textPath></text>
      <text x="150" y="232" text-anchor="middle" font-family="Oswald" font-size="30" fill="${t.ink}">✦</text><text x="874" y="232" text-anchor="middle" font-family="Oswald" font-size="30" fill="${t.ink}">✦</text>
      <g transform="translate(512 1196)"><path d="M-400 -38 H400 L370 0 L400 38 H-400 L-370 0 Z" fill="${t.glass}" stroke="${t.ink}" stroke-width="3"/>
        <text y="16" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${fit(name, 640, 50, 0.6)}" letter-spacing="3" fill="${t.ink}">${esc(name)}</text></g>
      <g transform="translate(830 1060)"><ellipse rx="74" ry="86" fill="${t.glass}" stroke="${t.ink}" stroke-width="3"/><ellipse rx="64" ry="76" fill="none" stroke="${t.hi}" stroke-width="1.5"/>${crest(-44, -66, 88, t.ink)}<text y="68" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="20" fill="${t.ink}">${esc(pos)}</text></g>
      ${tag ? `<text x="512" y="1262" text-anchor="middle" font-family="Inter" font-style="italic" font-size="18" fill="${t.sub}">${tag}</text>` : ''}
      ${stats.length ? `<path d="M90 1286 H934" stroke="${t.ink}" stroke-width="1.5"/>${statRow(1330, t.ink, t.sub)}` : ''}
      ${footer(t.sub)}`;
  } else if (d.style === 'cyber') {
    // Neo-Tokyo glitch: duotone art, slice offsets, crosshairs, warning tape, katakana-free tech type.
    body = `<defs><filter id="duoC"><feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="0.02 1"/><feFuncG type="table" tableValues="0.01 0.17"/><feFuncB type="table" tableValues="0.05 0.84"/></feComponentTransfer></filter>
      <clipPath id="frC"><path d="M60 60 H900 L964 124 V1250 L904 1310 H60 Z"/></clipPath>
      <pattern id="tapeC" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="20" height="40" fill="${t.hi}"/><rect x="20" width="20" height="40" fill="${t.bg}"/></pattern>
      <pattern id="gridC" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0 H0 V32" fill="none" stroke="${t.hi}" stroke-opacity="0.08"/></pattern></defs>
      <rect width="${W}" height="${H}" fill="${t.bg}"/><rect width="${W}" height="${H}" fill="url(#gridC)"/>
      <g clip-path="url(#frC)">${d.art ? `<image href="${d.art}" x="0" y="0" width="${W}" height="1340" preserveAspectRatio="xMidYMin slice" filter="url(#duoC)"/>
        <g opacity="0.85"><svg x="-18" y="380" width="${W}" height="60" viewBox="0 380 ${W} 60" preserveAspectRatio="none">${art()}</svg><svg x="22" y="760" width="${W}" height="34" viewBox="0 760 ${W} 34" preserveAspectRatio="none">${art()}</svg></g>` : ''}
        <rect x="0" y="0" width="${W}" height="1340" fill="${accent}" opacity="0.12"/></g>
      <path d="M60 60 H900 L964 124 V1250 L904 1310 H60 Z" fill="none" stroke="${t.hi}" stroke-width="4"/>
      <rect x="60" y="${comp === 'editorial' ? 150 : 980}" width="904" height="26" fill="url(#tapeC)"/>
      <text x="80" y="104" font-family="Inter" font-weight="700" font-size="16" letter-spacing="3" fill="${t.hi}">VERIFIED PRO // ${esc(club.slice(0, 22))}</text>
      <g stroke="${t.hi2}" stroke-width="2" fill="none"><circle cx="836" cy="300" r="40"/><path d="M836 244 V356 M780 300 H892"/></g>
      <text x="900" y="410" text-anchor="end" font-family="Inter" font-size="13" letter-spacing="2" fill="${t.hi2}">X.${(name.length * 37) % 999} / Y.${(club.length * 53) % 999}</text>
      <g transform="translate(80 ${comp === 'editorial' ? 260 : 1110})">
        <text font-family="Oswald" font-weight="700" font-size="${fit(name, 760, 96, 0.5)}" fill="${t.hi2}" transform="translate(6 0)" opacity="0.8">${esc(name)}</text>
        <text font-family="Oswald" font-weight="700" font-size="${fit(name, 760, 96, 0.5)}" fill="${t.ink}">${esc(name)}</text>
        <rect y="22" width="${Math.min(760, 40 + club.length * 18)}" height="40" fill="${t.hi}"/><text x="14" y="51" font-family="Inter" font-weight="700" font-size="20" letter-spacing="3" fill="${t.bg}">${esc(club.slice(0, 36))}</text>
      </g>
      <g transform="translate(820 1120)"><rect width="120" height="120" fill="${t.bg}" stroke="${t.hi}" stroke-width="3"/>${crest(20, 10, 80, t.hi)}<text x="60" y="110" text-anchor="middle" font-family="Inter" font-weight="700" font-size="18" fill="${t.hi}">${esc(pos)}${ovr ? ` ${esc(ovr)}` : ''}</text></g>
      ${tag ? `<text x="80" y="1290" font-family="Inter" font-size="16" letter-spacing="2" fill="${t.sub}">// ${tag}</text>` : ''}
      ${stats.length ? `<rect x="60" y="1316" width="904" height="2" fill="${t.hi}"/>${statRow(1350, t.hi, t.sub, true)}` : ''}
      ${Array.from({ length: 22 }, (_, i) => `<rect x="${720 + i * 9}" y="84" width="${(i * 7) % 3 + 2}" height="28" fill="${t.ink}" opacity="0.7"/>`).join('')}
      ${footer(t.sub)}`;
  } else if (d.style === 'chrome') {
    // Liquid chrome glassmorphism: iridescent bevelled border and frosted acrylic plaques.
    body = `<defs><linearGradient id="irisL" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${t.hi}"/><stop offset="0.25" stop-color="#ffffff"/><stop offset="0.5" stop-color="${t.hi2}"/><stop offset="0.75" stop-color="${accent}"/><stop offset="1" stop-color="${t.hi}"/></linearGradient>
      <linearGradient id="chromeL" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset="0.45" stop-color="#8a96a8"/><stop offset="0.52" stop-color="#1f2733"/><stop offset="1" stop-color="#d9e1ec"/></linearGradient>
      <clipPath id="winL"><rect x="54" y="54" width="916" height="1260" rx="56"/></clipPath>
      <filter id="blurL"><feGaussianBlur stdDeviation="14"/></filter></defs>
      <rect width="${W}" height="${H}" fill="${t.bg}"/><rect x="18" y="18" width="988" height="1330" rx="78" fill="url(#irisL)"/><rect x="34" y="34" width="956" height="1298" rx="66" fill="url(#chromeL)"/>
      <g clip-path="url(#winL)"><rect width="${W}" height="1340" fill="${t.bg}"/>${art()}<rect x="54" y="${comp === 'editorial' ? 54 : 1040}" width="916" height="280" fill="${t.bg}" opacity="0.35"/></g>
      <g transform="translate(90 ${comp === 'editorial' ? 96 : 1076})"><rect width="844" height="${stats.length ? 172 : 196}" rx="34" fill="${t.glass}" fill-opacity="0.16" stroke="url(#irisL)" stroke-width="3"/>
        <rect x="2" y="2" width="840" height="60" rx="32" fill="#ffffff" opacity="0.12"/>
        <text x="40" y="96" font-family="Oswald" font-weight="700" font-size="${fit(name, 580, 82, 0.5)}" fill="url(#irisL)" stroke="#ffffff" stroke-opacity="0.4" stroke-width="1">${esc(name)}</text>
        <text x="42" y="140" font-family="Inter" font-weight="700" font-size="20" letter-spacing="6" fill="${t.sub}">${esc(club)}</text>
        <circle cx="760" cy="${stats.length ? 86 : 98}" r="62" fill="${t.bg}" fill-opacity="0.5" stroke="url(#irisL)" stroke-width="4"/>${crest(722, (stats.length ? 86 : 98) - 46, 76, t.ink)}
      </g>
      <g transform="translate(${comp === 'editorial' ? 724 : 90} ${comp === 'editorial' ? 1200 : 96})"><rect width="${ovr ? 210 : 140}" height="64" rx="32" fill="${t.glass}" fill-opacity="0.18" stroke="url(#irisL)" stroke-width="2"/><text x="${ovr ? 105 : 70}" y="43" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="30" fill="${t.ink}">${esc(pos)}${ovr ? ` · ${esc(ovr)}` : ''}</text></g>
      ${tag ? `<text x="512" y="1300" text-anchor="middle" font-family="Inter" font-size="16" letter-spacing="2" fill="${t.sub}">${tag}</text>` : ''}
      ${stats.length ? statRow(1374, t.ink, t.sub) : ''}
      ${footer(t.sub)}`;
  } else if (d.style === 'mvp') {
    // Tournament MVP: carbon fibre, brushed gold slashes, vertical crest column.
    body = `<defs><pattern id="carbonM" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#0b0b0b"/><rect width="6" height="6" fill="#161616"/><rect x="6" y="6" width="6" height="6" fill="#161616"/></pattern>
      <linearGradient id="goldM" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7a5a1d"/><stop offset="0.3" stop-color="${t.hi2}"/><stop offset="0.55" stop-color="${t.hi}"/><stop offset="0.8" stop-color="#fff2c4"/><stop offset="1" stop-color="#8c6a26"/></linearGradient>
      <clipPath id="winMv"><path d="M${comp === 'side-panel' ? 250 : 60} 60 H964 V1180 L884 1260 H${comp === 'side-panel' ? 250 : 60} Z"/></clipPath>
      <linearGradient id="fadeMv" x1="0" y1="0" x2="0" y2="1"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.9"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#carbonM)"/>
      <g clip-path="url(#winMv)">${art()}<rect width="${W}" height="1340" fill="url(#fadeMv)"/></g>
      <path d="M${comp === 'side-panel' ? 250 : 60} 60 H964 V1180 L884 1260 H${comp === 'side-panel' ? 250 : 60} Z" fill="none" stroke="url(#goldM)" stroke-width="6"/>
      <path d="M0 980 L1024 760 V790 L0 1010 Z" fill="url(#goldM)" opacity="0.55"/><path d="M0 1030 L1024 830 V840 L0 1040 Z" fill="url(#goldM)" opacity="0.35"/>
      ${comp === 'side-panel' ? `<rect x="60" y="60" width="160" height="1200" fill="#0a0a0a" stroke="url(#goldM)" stroke-width="3"/>${crest(80, 90, 120, t.ink)}<text transform="translate(162 1220) rotate(-90)" font-family="Oswald" font-weight="700" font-size="${fit(club, 900, 70, 0.6)}" letter-spacing="8" fill="url(#goldM)">${esc(club)}</text>`
        : `<g transform="translate(90 92)"><rect width="200" height="44" fill="url(#goldM)"/><text x="100" y="31" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="24" letter-spacing="4" fill="#0a0a0a">${esc(d.competition ? fitText(d.competition, 12) : 'ELITE TIER')}</text></g><g transform="translate(830 84)">${crest(0, 0, 100, t.ink)}</g>`}
      <g transform="translate(${comp === 'side-panel' ? 280 : 90} 1120)"><text font-family="Oswald" font-weight="700" font-size="${fit(name, comp === 'side-panel' ? 600 : 760, 88, 0.5)}" fill="url(#goldM)">${esc(name)}</text>
        <text y="46" font-family="Inter" font-weight="700" font-size="20" letter-spacing="6" fill="${t.sub}">${comp === 'side-panel' ? '' : `${esc(club)}  ·  `}${esc(pos)}</text></g>
      ${ovr ? `<g transform="translate(880 1060)"><path d="M0 -60 L52 -30 V30 L0 60 L-52 30 V-30 Z" fill="#0a0a0a" stroke="url(#goldM)" stroke-width="4"/><text y="18" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="50" fill="url(#goldM)">${esc(ovr)}</text></g>` : ''}
      ${tag ? `<text x="${comp === 'side-panel' ? 280 : 90}" y="1236" font-family="Inter" font-size="16" letter-spacing="2" fill="${t.sub}">${tag}</text>` : ''}
      ${stats.length ? `<rect x="60" y="1290" width="904" height="2" fill="url(#goldM)"/>${statRow(1336, t.ink, t.sub)}` : ''}
      ${footer(t.sub)}`;
  } else {
    // Synthwave / chillwave: sunset bands, perspective grid, neon outline lettering.
    const sunY = comp === 'editorial' ? 500 : 420;
    body = `<defs><linearGradient id="skyS" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#120a33"/><stop offset="0.45" stop-color="#4b1670"/><stop offset="0.75" stop-color="${t.hi}"/><stop offset="1" stop-color="${t.sun}"/></linearGradient>
      <linearGradient id="sunS" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff07a"/><stop offset="0.5" stop-color="${t.sun}"/><stop offset="1" stop-color="${t.hi}"/></linearGradient>
      <linearGradient id="neonS" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${t.hi2}"/><stop offset="1" stop-color="${t.hi}"/></linearGradient>
      <clipPath id="sunClip"><circle cx="512" cy="${sunY}" r="250"/></clipPath>
      <filter id="glowS" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <linearGradient id="fadeS" x1="0" y1="0" x2="0" y2="1"><stop offset="0.6" stop-color="${t.bg}" stop-opacity="0"/><stop offset="1" stop-color="${t.bg}" stop-opacity="0.95"/></linearGradient>
      <clipPath id="winS"><rect x="44" y="44" width="936" height="1280" rx="24"/></clipPath></defs>
      <rect width="${W}" height="${H}" fill="${t.bg}"/>
      <g clip-path="url(#winS)"><rect width="${W}" height="1340" fill="url(#skyS)"/>
        <g clip-path="url(#sunClip)"><rect x="262" y="${sunY - 250}" width="500" height="500" fill="url(#sunS)"/>${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="262" y="${sunY + 30 + i * 36}" width="500" height="${6 + i * 3}" fill="#4b1670"/>`).join('')}</g>
        <g stroke="${t.hi2}" stroke-width="2" opacity="0.7">${Array.from({ length: 13 }, (_, i) => `<path d="M${512 + (i - 6) * 40} 860 L${512 + (i - 6) * 260} 1340"/>`).join('')}${[0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M0 ${860 + i * i * 10 + i * 20} H${W}"/>`).join('')}</g>
        <rect y="830" width="${W}" height="30" fill="${t.hi}" opacity="0.25"/>
        ${d.art ? `<image href="${d.art}" x="0" y="0" width="${W}" height="1340" preserveAspectRatio="xMidYMin slice"/>` : ''}
        <rect width="${W}" height="1340" fill="url(#fadeS)"/></g>
      <rect x="44" y="44" width="936" height="1280" rx="24" fill="none" stroke="url(#neonS)" stroke-width="6" filter="url(#glowS)"/>
      <text x="512" y="${comp === 'editorial' ? 120 : 130}" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${fit(club, 760, 64, 0.6)}" letter-spacing="10" fill="none" stroke="${t.hi2}" stroke-width="2.5" filter="url(#glowS)">${esc(club)}</text>
      <g transform="translate(512 1150)" text-anchor="middle"><text font-family="Oswald" font-weight="700" font-style="italic" font-size="${fit(name, 800, 100, 0.5)}" fill="url(#neonS)" filter="url(#glowS)">${esc(name)}</text>
        <text y="54" font-family="Inter" font-weight="700" font-size="22" letter-spacing="10" fill="${t.ink}">${esc(pos)}${ovr ? `  ·  ${esc(ovr)}` : ''}</text></g>
      <g transform="translate(80 80)">${crest(0, 0, 80, t.ink)}</g>
      ${tag ? `<text x="512" y="1260" text-anchor="middle" font-family="Inter" font-size="17" letter-spacing="3" fill="${t.sub}">${tag}</text>` : ''}
      ${stats.length ? statRow(1368, t.hi2, t.sub) : ''}
      ${footer(t.sub)}`;
  }
  return G.render(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`);
}

function fitText(s, n) { return String(s || '').toUpperCase().slice(0, n); }

const SIGNATURE_STYLES = Object.keys(THEMES);
module.exports = { renderSignatureCard, SIGNATURE_STYLES };
