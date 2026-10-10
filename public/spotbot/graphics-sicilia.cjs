// 1974 Palermo collectible: Calciatori sticker x 1960s/70s baseball card x Sicilian cinema poster.
// Front and back are drawn locally; the back's biography is openly labelled as fiction.
const C = { ivory: '#efe4c8', paper: '#e6d6b0', ink: '#1a1214', pink: '#e98bb5', deep: '#c2558a', gold: '#c9a34e', black: '#141012' };

const seedOf = (s) => [...String(s || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = (arr, seed, k) => arr[(seed >>> (k * 3)) % arr.length];

// Trinacria-inspired tile + Palermo skyline (domes, bell towers, Monte Pellegrino) as pure geometry.
function defs(accent) {
  return `<defs>
    <pattern id="tileS" width="64" height="64" patternUnits="userSpaceOnUse"><rect width="64" height="64" fill="${C.ivory}"/>
      <path d="M32 4 L60 32 L32 60 L4 32 Z" fill="none" stroke="${C.gold}" stroke-width="2" opacity="0.5"/><circle cx="32" cy="32" r="9" fill="none" stroke="${accent}" stroke-width="2" opacity="0.45"/>
      <path d="M32 23 V41 M23 32 H41" stroke="${C.ink}" stroke-width="1.2" opacity="0.3"/><circle cx="0" cy="0" r="6" fill="${accent}" opacity="0.35"/><circle cx="64" cy="64" r="6" fill="${accent}" opacity="0.35"/><circle cx="64" cy="0" r="6" fill="${accent}" opacity="0.35"/><circle cx="0" cy="64" r="6" fill="${accent}" opacity="0.35"/></pattern>
    <pattern id="grainS" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" fill="${C.ink}" opacity="0.18"/><circle cx="3.5" cy="3" r="0.6" fill="#fff" opacity="0.2"/></pattern>
    <filter id="printS"><feColorMatrix type="matrix" values="0.85 0.12 0.05 0 0.04  0.06 0.78 0.08 0 0.03  0.05 0.1 0.62 0 0.02  0 0 0 1 0"/></filter>
    <radialGradient id="ageS" cx="0.5" cy="0.5" r="0.75"><stop offset="0.6" stop-color="#8a6a3a" stop-opacity="0"/><stop offset="1" stop-color="#6b4a22" stop-opacity="0.38"/></radialGradient>
    <linearGradient id="goldS" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8d6a26"/><stop offset="0.45" stop-color="#f0d68a"/><stop offset="1" stop-color="#9c7630"/></linearGradient>
  </defs>`;
}

const skyline = (y, fill) => `<path d="M40 ${y} V${y - 40} H90 V${y - 70} Q112 ${y - 112} 134 ${y - 70} V${y - 40} H190 V${y - 96} H206 V${y - 128} L214 ${y - 142} L222 ${y - 128} V${y - 96} H238 V${y - 46} H300 Q330 ${y - 104} 360 ${y - 46} H420 V${y - 64} H470 V${y - 40} H560 Q620 ${y - 150} 700 ${y - 170} Q790 ${y - 190} 860 ${y - 110} Q920 ${y - 60} 984 ${y - 52} V${y} Z" fill="${fill}"/>
  <circle cx="112" cy="${y - 96}" r="7" fill="${fill}"/><circle cx="330" cy="${y - 108}" r="5" fill="${fill}"/>`;

const crestSvg = (d, x, y, s) => `<g transform="translate(${x} ${y})">
  <path d="M0 ${-s} C${s * 0.75} ${-s} ${s} ${-s * 0.7} ${s} ${-s * 0.25} C${s} ${s * 0.45} ${s * 0.45} ${s * 0.85} 0 ${s} C${-s * 0.45} ${s * 0.85} ${-s} ${s * 0.45} ${-s} ${-s * 0.25} C${-s} ${-s * 0.7} ${-s * 0.75} ${-s} 0 ${-s} Z" fill="${C.black}" stroke="url(#goldS)" stroke-width="5"/>
  <path d="M${-s * 0.5} ${-s * 0.55} H${s * 0.5} V${s * 0.2} Q0 ${s * 0.7} ${-s * 0.5} ${s * 0.2} Z" fill="${C.pink}"/><path d="M0 ${-s * 0.55} V${s * 0.47}" stroke="${C.black}" stroke-width="${s * 0.16}"/>
  ${d.crest ? `<image href="${d.crest}" x="${-s * 0.42}" y="${-s * 0.5}" width="${s * 0.84}" height="${s * 0.84}" preserveAspectRatio="xMidYMid meet"/>` : ''}
  <path d="M${-s * 0.3} ${-s * 1.1} L${-s * 0.15} ${-s * 0.95} L0 ${-s * 1.15} L${s * 0.15} ${-s * 0.95} L${s * 0.3} ${-s * 1.1} L${s * 0.25} ${-s * 0.86} H${-s * 0.25} Z" fill="url(#goldS)"/></g>`;

function renderSiciliaCard(d, G, accent = C.pink) {
  const esc = G.esc;
  const words = String(d.name || 'GIOCATORE').trim().split(/\s+/);
  const surname = words.length > 1 ? words.pop().toUpperCase() : words[0].toUpperCase();
  const first = words.length && words[0].toUpperCase() !== surname ? words.join(' ').toUpperCase() : '';
  const club = String(d.clubName || 'PALERMO').toUpperCase().slice(0, 30);
  const pos = String(d.position || '').toUpperCase().slice(0, 6);
  const num = /^\d{1,2}$/.test(String(d.number || '')) ? String(d.number) : '';
  const stats = (d.stats || []).slice(0, 4);
  const sz = Math.max(48, Math.min(150, Math.floor(860 / Math.max(surname.length * 0.56, 1))));
  const editorial = d.composition === 'editorial';
  return G.render(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1434" viewBox="0 0 1024 1434">${defs(C.pink)}
    <rect width="1024" height="1434" fill="${C.paper}"/>
    <rect x="22" y="22" width="980" height="1332" fill="${C.black}"/><rect x="34" y="34" width="956" height="1308" fill="url(#tileS)"/>
    <rect x="58" y="58" width="908" height="1022" fill="${C.pink}"/>${skyline(1080, C.deep)}
    <clipPath id="winSi"><path d="M74 140 Q512 ${editorial ? 70 : 96} 950 140 V1064 H74 Z"/></clipPath>
    ${d.art ? `<image href="${d.art}" x="74" y="96" width="876" height="968" preserveAspectRatio="xMidYMin slice" clip-path="url(#winSi)" filter="url(#printS)"/>` : ''}
    <path d="M74 140 Q512 ${editorial ? 70 : 96} 950 140 V1064 H74 Z" fill="url(#grainS)"/>
    <path d="M74 140 Q512 ${editorial ? 70 : 96} 950 140 V1064 H74 Z" fill="none" stroke="${C.black}" stroke-width="6"/>
    <g transform="translate(512 120)"><path d="M-330 -46 H330 L300 0 L330 46 H-330 L-300 0 Z" fill="${C.black}" stroke="url(#goldS)" stroke-width="4"/>
      <text y="17" text-anchor="middle" font-family="Oswald" font-weight="700" font-style="italic" font-size="${Math.min(52, Math.floor(560 / Math.max(club.length * 0.55, 1)))}" letter-spacing="6" fill="${C.pink}">${esc(club)}</text></g>
    ${crestSvg(d, 150, 260, 62)}
    ${num ? `<g transform="translate(868 250)"><circle r="62" fill="${C.ivory}" stroke="${C.black}" stroke-width="5"/><circle r="52" fill="none" stroke="${C.gold}" stroke-width="2"/><text y="26" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="74" fill="${C.black}">${esc(num)}</text></g>` : ''}
    <g transform="translate(830 990) rotate(-8)"><path d="M-110 -26 H110 L94 0 L110 26 H-110 L-94 0 Z" fill="${C.gold}" stroke="${C.black}" stroke-width="3"/><text y="10" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="28" letter-spacing="8" fill="${C.black}">SICILIA</text></g>
    <rect x="58" y="1080" width="908" height="250" fill="${C.black}"/>
    <rect x="58" y="1080" width="908" height="10" fill="url(#goldS)"/>
    ${first ? `<text x="90" y="1140" font-family="Oswald" font-style="italic" font-size="34" letter-spacing="5" fill="${C.ivory}">${esc(first.slice(0, 30))}</text>` : ''}
    <text x="86" y="${first ? 1140 + sz * 0.9 : 1110 + sz * 0.95}" font-family="Oswald" font-weight="700" font-size="${sz}" fill="${C.pink}" stroke="${C.ivory}" stroke-width="2" paint-order="stroke">${esc(surname.slice(0, 26))}</text>
    ${pos ? `<g transform="translate(870 1150)"><rect x="-70" y="-36" width="140" height="56" rx="28" fill="${C.pink}" stroke="${C.ivory}" stroke-width="3"/><text y="6" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="30" fill="${C.black}">${esc(pos)}</text></g>` : ''}
    ${stats.length ? stats.map(([l, v], i) => `<text x="${640 + i * 82}" y="1300" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="28" fill="${C.ivory}">${esc(v)}</text><text x="${640 + i * 82}" y="1318" text-anchor="middle" font-family="Inter" font-size="10" fill="${C.gold}">${esc(String(l).slice(0, 9))}</text>`).join('') : ''}
    <rect width="1024" height="1434" fill="url(#ageS)"/>
    <text x="512" y="1416" text-anchor="middle" font-family="Inter" font-size="12" fill="${C.ink}">${stats.length ? 'EA MATCH DATA · ' : ''}AI VIRTUAL PRO ART · GAFFERBOT STUDIO</text>
  </svg>`);
}

const BIRTH = ['a lemon grove above Mondello', 'the back room of a Ballarò fish stall', 'a Vespa repair shop in Kalsa', 'the steps of Teatro Massimo', 'a cannoli bakery in Monreale', 'a fishing boat off Isola delle Femmine'];
const HOBBY = ['arguing with referees in three dialects', 'collecting espresso cups from every away ground', 'singing opera in the dressing-room shower', 'racing his nonna up Monte Pellegrino', 'teaching pigeons to recognise club colours', 'polishing his boots with olive oil'];
const QUIRK = ['refuses to play without an arancina at half-time', 'claims his curls add three yards of pace', 'once nutmegged a priest at a wedding', 'insists every goal is dedicated to Santa Rosalia', 'has never lost a game of scopa on the team bus', 'wears sunglasses during night matches "for style"'];

// Card back: soccer translation of a baseball-card stat line plus clearly labelled fictional lore.
function renderSiciliaBack(d, G) {
  const esc = G.esc;
  const seed = seedOf(d.name);
  const get = (k) => (d.stats || []).find(([l]) => l === k)?.[1];
  const line = [['PRESENZE', get('GAMES')], ['GOL', get('GOALS')], ['ASSIST', get('ASSISTS')], ['VOTO', get('RATING')]].filter(([, v]) => v != null && v !== '');
  const name = String(d.name || '').toUpperCase().slice(0, 30);
  const bio = [`Born (so the legend goes) in ${pick(BIRTH, seed, 0)}.`, `Off the pitch: ${pick(HOBBY, seed, 1)}.`, `Famously: ${pick(QUIRK, seed, 2)}.`];
  return G.render(`<svg xmlns="http://www.w3.org/2000/svg" width="1434" height="1024" viewBox="0 0 1434 1024">${defs(C.pink)}
    <rect width="1434" height="1024" fill="${C.paper}"/><rect x="22" y="22" width="1390" height="980" fill="${C.black}"/><rect x="34" y="34" width="1366" height="956" fill="${C.ivory}"/>
    <rect x="34" y="34" width="1366" height="956" fill="url(#grainS)"/>
    <rect x="60" y="60" width="1314" height="120" fill="${C.pink}" stroke="${C.black}" stroke-width="4"/>
    <circle cx="140" cy="120" r="44" fill="${C.black}"/><text x="140" y="136" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="44" fill="${C.pink}">${esc(/^\d{1,2}$/.test(String(d.number || '')) ? d.number : String(d.position || 'P').toUpperCase().slice(0, 3))}</text>
    <text x="210" y="138" font-family="Oswald" font-weight="700" font-size="${Math.min(60, Math.floor(860 / Math.max(name.length * 0.55, 1)))}" fill="${C.black}">${esc(name)}</text>
    <text x="1340" y="110" text-anchor="end" font-family="Oswald" font-size="26" letter-spacing="4" fill="${C.black}">${esc(String(d.clubName || '').toUpperCase().slice(0, 28))}</text>
    <text x="1340" y="150" text-anchor="end" font-family="Oswald" font-size="24" letter-spacing="4" fill="${C.black}">${esc(String(d.position || '').toUpperCase())} · SICILIA</text>
    <text x="80" y="250" font-family="Oswald" font-weight="700" font-size="30" letter-spacing="6" fill="${C.deep}">STATISTICHE</text>
    <rect x="80" y="270" width="1274" height="190" fill="none" stroke="${C.black}" stroke-width="3"/>
    ${line.length ? line.map(([l, v], i) => { const x = 80 + (1274 / line.length) * (i + 0.5); return `<text x="${x}" y="330" text-anchor="middle" font-family="Oswald" font-size="24" letter-spacing="4" fill="${C.deep}">${l}</text><text x="${x}" y="420" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="76" fill="${C.black}">${esc(v)}</text>`; }).join('')
      : `<text x="717" y="380" text-anchor="middle" font-family="Oswald" font-size="34" fill="${C.ink}">STATS NOT YET RECORDED</text>`}
    <text x="80" y="492" font-family="Inter" font-size="14" fill="${C.ink}">${line.length ? esc(`${d.dataLabel || d.seasonLabel || 'EA MATCH DATA'} · verified club data`) : ''}</text>
    <text x="80" y="540" font-family="Oswald" font-weight="700" font-size="30" letter-spacing="6" fill="${C.deep}">LA LEGGENDA</text>
    ${bio.map((b, i) => `<text x="80" y="${600 + i * 56}" font-family="Inter" font-style="italic" font-size="30" fill="${C.ink}">${esc(b)}</text>`).join('')}
    <g transform="translate(1180 700)"><path d="M-130 -34 H130 L110 0 L130 34 H-130 L-110 0 Z" fill="${C.gold}" stroke="${C.black}" stroke-width="3"/><text y="11" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="30" letter-spacing="8" fill="${C.black}">SICILIA</text></g>
    ${skyline(980, C.pink)}
    <rect x="34" y="900" width="1366" height="90" fill="${C.black}" opacity="0.9"/>
    <text x="717" y="955" text-anchor="middle" font-family="Inter" font-size="18" fill="${C.ivory}">La Leggenda is playful fiction, not real biography · Stats from saved club data · GAFFERBOT STUDIO</text>
    <rect width="1434" height="1024" fill="url(#ageS)"/>
  </svg>`);
}

module.exports = { renderSiciliaCard, renderSiciliaBack };
