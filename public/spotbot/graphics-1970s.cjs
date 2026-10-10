// Seventies print geometry stays local; the artwork remains a club-kit Virtual Pro.
function render1970sCard(d, G, accent) {
  const C = { paper: '#f3f0df', ink: '#17231e', blue: '#69bfc5', gold: '#dcad53', pale: '#faf6e7' };
  const esc = G.esc;
  const ribbon = d.composition === 'side-panel';
  const alternate = d.composition === 'editorial';
  const name = String(d.name || '').toUpperCase().slice(0, 40);
  const club = String(d.clubName || 'PRO CLUBS').toUpperCase().slice(0, 40);
  const pos = String(d.position || '').toUpperCase().slice(0, 12);
  const fit = (t, w, max) => Math.max(18, Math.min(max, Math.floor(w / Math.max(t.length * 0.58, 1))));
  const stats = (d.stats || []).slice(0, 6);
  // 1974 Topps split: city on the top pennant, nickname on the bottom one — the club is never printed twice.
  const words = club.split(/\s+/).filter(Boolean);
  const topLabel = words.length > 1 ? words.slice(0, -1).join(' ') : club;
  const bottomLabel = words.length > 1 ? words[words.length - 1] : '';
  const nameParts = name.split(/\s+/).filter(Boolean);
  const first = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '';
  const last = nameParts.length ? nameParts[nameParts.length - 1] : '';
  const photo = ribbon ? '<rect x="82" y="228" width="860" height="980" rx="62"/>' : '<path d="M82 590 C82 196 942 196 942 590 V1186 Q942 1220 908 1220 H116 Q82 1220 82 1186 Z"/>';
  const archSize = fit(club, 790, 110);
  // Separate glyphs preserve the arch when rendered by engines without SVG textPath.
  const letters = [...club].map((letter, i) => {
    const t = club.length === 1 ? 0.5 : i / (club.length - 1);
    const x = 130 + 764 * t;
    const y = 288 - 104 * Math.sin(Math.PI * t);
    const angle = -22 * Math.cos(Math.PI * t);
    return `<text transform="translate(${x} ${y}) rotate(${angle})" text-anchor="middle" font-family="Oswald" font-size="${archSize}" font-weight="700" fill="${alternate ? C.gold : accent}" stroke="${C.ink}" stroke-width="3" paint-order="stroke">${esc(letter)}</text>`;
  }).join('');
  const stars = [112, 912].map((x) => `<path transform="translate(${x} 335)" d="M0 -16 L5 -5 L17 -5 L8 3 L11 16 L0 9 L-11 16 L-8 3 L-17 -5 L-5 -5 Z" fill="${C.gold}" stroke="${C.ink}" stroke-width="3"/>`).join('');
  return G.render(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1434" viewBox="0 0 1024 1434">
    <defs><clipPath id="portrait70">${photo}</clipPath><pattern id="paper70" width="19" height="23" patternUnits="userSpaceOnUse"><circle cx="4" cy="6" r="0.7" fill="${C.ink}" opacity="0.08"/><circle cx="14" cy="17" r="0.6" fill="${C.ink}" opacity="0.04"/></pattern></defs>
    <rect width="1024" height="1434" fill="${C.paper}"/>
    ${ribbon ? `<path d="M82 206 V144 Q82 92 136 92 H570 L540 140 L570 194 H82 Z" fill="${accent}" stroke="${C.ink}" stroke-width="6"/>
      <text x="324" y="164" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${fit(topLabel, 422, 64)}" fill="${C.ink}">${esc(topLabel)}</text>
      <text x="774" y="164" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${fit(pos, 280, 48)}" fill="${C.ink}">${esc(pos)}</text>` : `<path d="M52 138 H170 Q512 22 854 138 H972 V1304 H52 Z" fill="${alternate ? accent : C.blue}" stroke="${C.ink}" stroke-width="6"/>
      <path d="M64 150 H172 Q512 40 852 150 H960 V1292 H64 Z" fill="none" stroke="${C.gold}" stroke-width="10"/>${letters}${stars}`}
    <g fill="${C.blue}" stroke="${C.ink}" stroke-width="22">${photo}</g>
    <g fill="none" stroke="${C.gold}" stroke-width="12">${photo}</g>
    ${d.art ? `<image href="${d.art}" x="82" y="${ribbon ? 228 : 354}" width="860" height="${ribbon ? 980 : 866}" preserveAspectRatio="xMidYMin slice" clip-path="url(#portrait70)"/>` : ''}
    <g fill="none" stroke="${C.pale}" stroke-width="4">${photo}</g>
    ${ribbon ? `<path d="M538 1234 H942 V1276 Q942 1328 884 1328 H538 L570 1280 Z" fill="${accent}" stroke="${C.ink}" stroke-width="5"/>
      ${first ? `<text x="96" y="1258" font-family="Oswald" font-size="30" letter-spacing="2" fill="${C.ink}">${esc(first)}</text>` : ''}
      <text x="96" y="${first ? 1318 : 1300}" font-family="Oswald" font-weight="700" font-size="${fit(last, 420, first ? 62 : 68)}" fill="${C.ink}">${esc(last)}</text>
      ${bottomLabel ? `<text x="756" y="1296" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${fit(bottomLabel, 300, 52)}" fill="${C.ink}">${esc(bottomLabel)}</text>` : ''}
      ${d.crest ? `<image href="${d.crest}" x="${bottomLabel ? 584 : 700}" y="1240" width="82" height="82" preserveAspectRatio="xMidYMid meet"/>` : (!bottomLabel ? `<text x="756" y="1296" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="44" fill="${C.ink}">★</text>` : '')}` : `<rect x="162" y="1196" width="700" height="100" rx="50" fill="${C.gold}" stroke="${C.ink}" stroke-width="6"/>
      <rect x="171" y="1205" width="682" height="82" rx="41" fill="${C.pale}" stroke="${C.ink}" stroke-width="3"/>
      <text x="512" y="1267" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${fit(name, 630, 64)}" fill="${C.ink}">${esc(name)}</text>
      ${pos ? `<text x="512" y="1330" text-anchor="middle" font-family="Oswald" font-size="24" fill="${C.ink}">${esc(pos)}</text>` : ''}`}
    ${stats.map(([label, value], i) => `<text x="${82 + 860 / stats.length * (i + 0.5)}" y="1364" text-anchor="middle" font-family="Oswald" font-size="24" fill="${C.ink}">${esc(value)}</text><text x="${82 + 860 / stats.length * (i + 0.5)}" y="1384" text-anchor="middle" font-family="Oswald" font-size="13" fill="${C.ink}">${esc(label)}</text>`).join('')}
    <rect width="1024" height="1434" fill="url(#paper70)"/>
    <text x="512" y="1414" text-anchor="middle" font-family="Inter" font-size="12" fill="${C.ink}">${stats.length ? 'EA MATCH DATA · ' : ''}AI VIRTUAL PRO ART · GAFFERBOT STUDIO</text>
  </svg>`);
}
module.exports = { render1970sCard };