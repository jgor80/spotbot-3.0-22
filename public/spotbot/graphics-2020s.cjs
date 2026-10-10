// Contemporary club editions: angular prism, mosaic foil and sculpted chrome.
function render2020sCard(d, G, accent) {
  const C = { ink: '#11191b', white: '#ffffff', silver: '#bdcbd0', shadow: '#39494e', cyan: '#82eee4', gold: '#efd5a1' };
  const esc = G.esc;
  const mosaic = d.composition === 'editorial';
  const sculpted = d.composition === 'side-panel';
  const name = String(d.name || '').toUpperCase().slice(0, 40);
  const club = String(d.clubName || 'PRO CLUBS').toUpperCase().slice(0, 40);
  const pos = String(d.position || '').toUpperCase().slice(0, 12);
  const fit = (s, w, max) => Math.max(18, Math.min(max, Math.floor(w / Math.max(s.length * 0.62, 1))));
  const stats = (d.stats || []).slice(0, 6);
  const frame = mosaic ? '<rect x="64" y="72" width="896" height="1220"/>' : sculpted
    ? '<path d="M66 182 H225 L292 70 H958 V1194 L855 1300 H66 Z"/>'
    : '<path d="M210 64 H824 L960 242 V1122 L798 1300 H64 V264 Z"/>';
  const badge = (x, y, size) => d.crest ? `<image href="${d.crest}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>` : `<text x="${x + size / 2}" y="${y + size * 0.67}" text-anchor="middle" font-family="Oswald" font-size="${size * 0.45}" font-weight="700" fill="${C.white}">FC</text>`;
  return G.render(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1434" viewBox="0 0 1024 1434">
    <defs>
      <clipPath id="portrait20">${frame}</clipPath>
      <linearGradient id="chrome20" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${C.shadow}"/><stop offset="0.2" stop-color="${C.white}"/><stop offset="0.42" stop-color="${C.silver}"/><stop offset="0.5" stop-color="${C.shadow}"/><stop offset="0.57" stop-color="${C.white}"/><stop offset="1" stop-color="${C.silver}"/></linearGradient>
      <linearGradient id="prism20" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${accent}"/><stop offset="0.32" stop-color="${C.gold}"/><stop offset="0.6" stop-color="${C.cyan}"/><stop offset="1" stop-color="${accent}"/></linearGradient>
      <linearGradient id="shade20" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${C.ink}" stop-opacity="0"/><stop offset="1" stop-color="${C.ink}" stop-opacity="0.98"/></linearGradient>
      <pattern id="mosaic20" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M2 2 H40 L2 40 Z" fill="url(#prism20)"/><path d="M40 4 V40 H4 Z" fill="url(#chrome20)"/></pattern>
      <pattern id="holoDots20" width="19" height="19" patternUnits="userSpaceOnUse"><circle cx="9" cy="9" r="5" fill="url(#prism20)"/><circle cx="8" cy="7" r="1.5" fill="${C.white}"/></pattern>
      <pattern id="clubStreak20" width="86" height="140" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)"><path d="M0 0 V140 M17 0 V140" stroke="${C.ink}" stroke-width="12"/><path d="M39 0 L60 140" stroke="${C.white}" stroke-width="3" opacity="0.5"/></pattern>
    </defs>
    <rect width="1024" height="1434" fill="${mosaic || sculpted ? C.white : C.ink}"/>
    ${mosaic ? '<rect x="22" y="22" width="980" height="1310" fill="url(#mosaic20)"/>' : sculpted
      ? `<rect x="22" y="22" width="980" height="1310" fill="url(#chrome20)"/><rect x="38" y="38" width="948" height="1278" fill="${accent}"/><path d="M40 350 Q512 10 985 435 Q590 540 40 890 Z" fill="url(#chrome20)"/>`
      : `<rect x="22" y="22" width="980" height="1310" fill="${accent}"/><rect x="22" y="22" width="980" height="1310" fill="url(#clubStreak20)"/>`}
    <g fill="${C.ink}">${frame}</g>
    ${d.art ? `<image href="${d.art}" x="64" y="64" width="896" height="1236" preserveAspectRatio="xMidYMin slice" clip-path="url(#portrait20)"/>` : ''}
    ${mosaic ? '<g clip-path="url(#portrait20)"><rect x="64" y="72" width="150" height="1220" fill="url(#holoDots20)" opacity="0.65"/><rect x="810" y="72" width="150" height="1220" fill="url(#holoDots20)" opacity="0.65"/></g>' : ''}
    <rect x="64" y="994" width="896" height="306" fill="url(#shade20)" clip-path="url(#portrait20)"/>
    <g fill="none" stroke="url(#chrome20)" stroke-width="12">${frame}</g>
    ${!mosaic && !sculpted ? `<path d="M82 1108 H732 L687 1184 H82 Z" fill="${C.ink}" stroke="url(#chrome20)" stroke-width="3"/>
      <text x="110" y="1161" font-family="Oswald" font-weight="700" font-size="${fit(name, 558, 55)}" fill="${C.white}">${esc(name)}</text>
      <path d="M82 1192 H664 L610 1260 H82 Z" fill="url(#chrome20)"/>
      <text x="110" y="1238" font-family="Oswald" font-size="${fit(club, 484, 30)}" font-weight="700" fill="${C.ink}">${esc(club)}</text>
      <path d="M764 1140 L910 1210 L764 1280 L694 1210 Z" fill="${C.ink}" stroke="url(#prism20)" stroke-width="5"/>
      ${badge(731, 1167, 88)}
      <text x="842" y="1230" text-anchor="middle" font-family="Oswald" font-size="${fit(pos, 73, 26)}" fill="${C.white}">${esc(pos)}</text>` : ''}
    ${mosaic ? `<path d="M84 1080 H920 V1112 H84 Z" fill="url(#prism20)"/>
      <text x="98" y="1184" font-family="Oswald" font-weight="700" font-size="${fit(name, 610, 62)}" fill="${C.white}">${esc(name)}</text>
      <text x="98" y="1237" font-family="Oswald" font-size="${fit(club, 615, 32)}" fill="${C.white}">${esc(club)}</text>
      <circle cx="824" cy="1200" r="80" fill="${C.ink}" stroke="url(#prism20)" stroke-width="5"/>
      ${badge(782, 1139, 84)}
      <text x="824" y="1257" text-anchor="middle" font-family="Oswald" font-size="${fit(pos, 120, 28)}" fill="${C.white}">${esc(pos)}</text>` : ''}
    ${sculpted ? `<path d="M82 198 H234 L308 80 H940" fill="none" stroke="${C.white}" stroke-width="3"/>
      <text x="907" y="143" text-anchor="end" font-family="Oswald" font-weight="700" font-size="${fit(club, 572, 52)}" fill="${C.white}" stroke="${C.ink}" stroke-width="2" paint-order="stroke">${esc(club)}</text>
      <rect x="82" y="1134" width="850" height="146" fill="${C.ink}" stroke="url(#chrome20)" stroke-width="4"/>
      <circle cx="160" cy="1206" r="59" fill="${accent}" stroke="url(#chrome20)" stroke-width="5"/>
      ${badge(119, 1165, 82)}
      <text x="240" y="1201" font-family="Oswald" font-style="italic" font-weight="700" font-size="${fit(name, 656, 58)}" fill="${C.white}">${esc(name)}</text>
      <path d="M240 1220 H899" stroke="${accent}" stroke-width="4"/>
      <text x="894" y="1260" text-anchor="end" font-family="Oswald" font-size="${fit(pos, 630, 27)}" fill="${C.white}">${esc(pos)}</text>` : ''}
    ${stats.map(([label, value], i) => `<text x="${54 + 916 / stats.length * (i + 0.5)}" y="1364" text-anchor="middle" font-family="Oswald" font-size="24" font-weight="700" fill="${mosaic || sculpted ? C.ink : C.white}">${esc(value)}</text><text x="${54 + 916 / stats.length * (i + 0.5)}" y="1385" text-anchor="middle" font-family="Oswald" font-size="13" fill="${mosaic || sculpted ? C.ink : C.white}">${esc(label)}</text>`).join('')}
    <text x="512" y="1416" text-anchor="middle" font-family="Inter" font-size="12" fill="${mosaic || sculpted ? C.ink : C.white}">${stats.length ? 'EA MATCH DATA · ' : ''}AI VIRTUAL PRO ART · GAFFERBOT STUDIO</text>
  </svg>`);
}
module.exports = { render2020sCard };