// Chrome refractor, circular masthead and brushed-metal action editions.
function renderY2kCard(d, G, accent) {
  const C = { paper: '#f5f6f3', ink: '#111c23', silver: '#bdc9cc', light: '#ffffff', dark: '#48575b', cyan: '#68d6dd', rose: '#e3a3ce', gold: '#e2cd87' };
  const esc = G.esc;
  const circles = d.composition === 'editorial';
  const brushed = d.composition === 'side-panel';
  const name = String(d.name || '').toUpperCase().slice(0, 40);
  const club = String(d.clubName || 'PRO CLUBS').toUpperCase().slice(0, 40);
  const pos = String(d.position || '').toUpperCase().slice(0, 12);
  const fit = (t, w, max) => Math.max(18, Math.min(max, Math.floor(w / Math.max(t.length * 0.59, 1))));
  const stats = (d.stats || []).slice(0, 6);
  const photoY = circles ? 206 : 70;
  const photoH = circles ? 998 : 1134;
  const photo = circles ? '<path d="M70 1204 V206 H360 L390 264 H634 L664 206 H954 V1204 Z"/>' : `<rect x="70" y="70" width="884" height="1134" rx="${brushed ? 0 : 42}"/>`;
  const diameter = Math.min(94, 880 / Math.max(club.length, 1));
  const letters = [...club].map((letter, i) => {
    const x = 512 - diameter * (club.length - 1) / 2 + diameter * i;
    return `<circle cx="${x}" cy="117" r="${diameter * 0.45}" fill="${i % 2 ? C.dark : accent}"/><text x="${x}" y="${117 + diameter * 0.24}" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${diameter * 0.7}" fill="${C.light}" stroke="${C.ink}" stroke-width="0.8" paint-order="stroke">${esc(letter)}</text>`;
  }).join('');
  return G.render(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1434" viewBox="0 0 1024 1434">
    <defs>
      <linearGradient id="chromeY2k" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${C.dark}"/><stop offset="0.18" stop-color="${C.light}"/><stop offset="0.36" stop-color="${C.silver}"/><stop offset="0.49" stop-color="${C.dark}"/><stop offset="0.53" stop-color="${C.light}"/><stop offset="0.74" stop-color="${C.silver}"/><stop offset="1" stop-color="${C.dark}"/></linearGradient>
      <linearGradient id="refractorY2k" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${accent}"/><stop offset="0.24" stop-color="${C.cyan}"/><stop offset="0.48" stop-color="${C.gold}"/><stop offset="0.72" stop-color="${C.rose}"/><stop offset="1" stop-color="${accent}"/></linearGradient>
      <pattern id="brushY2k" width="17" height="5" patternUnits="userSpaceOnUse"><path d="M0 1 H17" stroke="${C.light}" stroke-width="0.5" opacity="0.22"/></pattern>
      <clipPath id="portraitY2k">${photo}</clipPath>
    </defs>
    <rect width="1024" height="1434" fill="${circles ? C.paper : C.ink}"/>
    ${circles ? letters : `<rect x="24" y="24" width="976" height="1386" fill="url(#chromeY2k)"/>
      <rect x="36" y="36" width="952" height="1362" fill="${brushed ? C.silver : accent}"/>
      <rect x="48" y="48" width="928" height="1340" fill="${brushed ? 'url(#brushY2k)' : 'url(#refractorY2k)'}"/>`}
    <g fill="${C.ink}" stroke="${C.ink}" stroke-width="16">${photo}</g>
    <g fill="none" stroke="${circles ? C.light : 'url(#chromeY2k)'}" stroke-width="9">${photo}</g>
    ${d.art ? `<image href="${d.art}" x="70" y="${photoY}" width="884" height="${photoH}" preserveAspectRatio="xMidYMid slice" clip-path="url(#portraitY2k)"/>` : ''}
    <g fill="none" stroke="${circles ? C.dark : 'url(#refractorY2k)'}" stroke-width="3">${photo}</g>
    ${!circles ? `<path d="M70 70 H170 L954 1150 V1204 H854 L70 130 Z" fill="url(#refractorY2k)" opacity="${brushed ? 0.08 : 0.12}" clip-path="url(#portraitY2k)"/>
      <text x="105" y="128" font-family="Oswald" font-weight="700" font-style="italic" font-size="${fit(club, 610, 38)}" fill="${C.light}" stroke="${C.ink}" stroke-width="1" paint-order="stroke">${esc(club)}</text>` : ''}
    ${!circles ? `<path d="M48 1242 H976 V1336 H48 Z" fill="url(#chromeY2k)" stroke="${C.ink}" stroke-width="4"/>
      <path d="M270 1250 H968 V1328 H270 Z" fill="${C.ink}" opacity="0.92"/>
      <path d="M164 1134 L274 1244 L164 1354 L54 1244 Z" fill="url(#refractorY2k)" stroke="${C.ink}" stroke-width="5"/>
      <path d="M164 1151 L257 1244 L164 1337 L71 1244 Z" fill="${C.ink}" stroke="${C.light}" stroke-width="2"/>
      ${d.crest ? `<image href="${d.crest}" x="110" y="1190" width="108" height="108" preserveAspectRatio="xMidYMid meet"/>` : `<text x="164" y="1258" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${fit(pos || 'FC', 138, 42)}" fill="${C.light}">${esc(pos || 'FC')}</text>`}
      <text x="620" y="1303" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${fit(name, 650, 60)}" fill="${C.light}">${esc(name)}</text>` : `<text x="512" y="1274" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${fit(name, 868, 68)}" fill="${C.ink}">${esc(name)}</text>
      <text x="512" y="1316" text-anchor="middle" font-family="Oswald" font-size="${fit(pos, 860, 30)}" fill="${C.dark}">${esc(pos)}</text>`}
    ${stats.map(([label, value], i) => `<text x="${54 + 916 / stats.length * (i + 0.5)}" y="1366" text-anchor="middle" font-family="Oswald" font-size="24" font-weight="700" fill="${C.ink}">${esc(value)}</text><text x="${54 + 916 / stats.length * (i + 0.5)}" y="1387" text-anchor="middle" font-family="Oswald" font-size="13" fill="${C.ink}">${esc(label)}</text>`).join('')}
    <text x="512" y="1420" text-anchor="middle" font-family="Inter" font-size="12" fill="${circles ? C.ink : C.light}">${stats.length ? 'EA MATCH DATA · ' : ''}AI VIRTUAL PRO ART · SPOTBOT STUDIO</text>
  </svg>`);
}
module.exports = { renderY2kCard };