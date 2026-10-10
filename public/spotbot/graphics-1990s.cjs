// Nineties collectible frames: colour-pop, clean action, and vertical club type.
function render1990sCard(d, G, accent) {
  const C = { paper: '#fafaf3', ink: '#141b24', foil: '#c7cbd0', highlight: '#ead568' };
  const esc = G.esc;
  const clean = d.composition === 'editorial';
  const vertical = d.composition === 'side-panel';
  const name = String(d.name || '').toUpperCase().slice(0, 40);
  const club = String(d.clubName || 'PRO CLUBS').toUpperCase().slice(0, 40);
  const pos = String(d.position || '').toUpperCase().slice(0, 12);
  const fit = (text, width, max) => Math.max(18, Math.min(max, Math.floor(width / Math.max(text.length * 0.59, 1))));
  const stats = (d.stats || []).slice(0, 6);
  const x = vertical ? 226 : clean ? 54 : 70;
  const y = clean ? 54 : vertical ? 64 : 222;
  const w = vertical ? 740 : clean ? 916 : 884;
  const h = clean ? 1184 : vertical ? 1160 : 998;
  const photo = `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  const verticalFont = Math.min(82, Math.floor(1090 / Math.max(club.length, 1)));
  const clubLetters = [...club].map((letter, i) => `<text x="128" y="${100 + verticalFont + i * verticalFont}" text-anchor="middle" font-family="Oswald" font-size="${verticalFont}" font-weight="700" fill="${accent}" stroke="${C.ink}" stroke-width="2" paint-order="stroke">${esc(letter)}</text>`).join('');
  return G.render(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1434" viewBox="0 0 1024 1434">
    <defs><clipPath id="portrait90">${photo}</clipPath><pattern id="speckle90" width="29" height="37" patternUnits="userSpaceOnUse"><circle cx="6" cy="9" r="2" fill="${C.ink}" opacity="0.5"/><circle cx="22" cy="28" r="1.3" fill="${C.paper}" opacity="0.6"/></pattern></defs>
    <rect width="1024" height="1434" fill="${C.paper}"/>
    ${!clean && !vertical ? `<rect x="28" y="28" width="968" height="1368" fill="${accent}"/>
      <rect x="28" y="28" width="968" height="1368" fill="url(#speckle90)"/>
      <path d="M44 44 H690 L658 183 H44 Z" fill="${C.ink}"/>
      <text x="83" y="95" font-family="Oswald" font-size="${fit(club, 540, 34)}" fill="${C.paper}">${esc(club)}</text>
      <text x="78" y="158" font-family="Oswald" font-style="italic" font-weight="700" font-size="${fit(name, 560, 66)}" fill="${C.paper}">${esc(name)}</text>
      <text x="930" y="110" text-anchor="end" font-family="Oswald" font-weight="700" font-size="${fit(pos, 220, 40)}" fill="${C.ink}">${esc(pos)}</text>
      <path d="M954 1225 V1380 H54 V1320 H204 V1225 Z" fill="${C.highlight}"/>
      <path d="M176 1238 H958 L934 1310 H153 Z" fill="${C.ink}"/>
      <text x="566" y="1289" text-anchor="middle" font-family="Oswald" font-style="italic" font-weight="700" font-size="${fit(name, 706, 56)}" fill="${C.paper}">${esc(name)}</text>` : ''}
    <g fill="${C.ink}">${photo}</g>
    ${d.art ? `<image href="${d.art}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMin slice" clip-path="url(#portrait90)"/>` : ''}
    <g fill="none" stroke="${clean ? C.paper : C.ink}" stroke-width="5">${photo}</g>
    ${clean ? `<path d="M54 1238 V917 L216 1238 Z" fill="${C.foil}" opacity="0.78"/>
      <path d="M55 984 L192 1238 M55 1064 L164 1238 M55 1144 L132 1238" stroke="${C.paper}" stroke-width="3"/>
      ${d.crest ? `<image href="${d.crest}" x="76" y="1138" width="78" height="78" preserveAspectRatio="xMidYMid meet"/>` : ''}
      <text x="950" y="104" text-anchor="end" font-family="Oswald" font-size="28" fill="${C.paper}" stroke="${C.ink}" stroke-width="1" paint-order="stroke">CLUB COLLECTION</text>
      <text x="64" y="1301" font-family="Oswald" font-weight="700" font-size="${fit(name, 760, 54)}" fill="${C.ink}">${esc(name)}</text>
      <text x="958" y="1301" text-anchor="end" font-family="Oswald" font-size="${fit(pos, 145, 36)}" fill="${C.ink}">${esc(pos)}</text>
      <text x="64" y="1335" font-family="Oswald" font-size="${fit(club, 870, 24)}" fill="${C.ink}">${esc(club)}</text>` : ''}
    ${vertical ? `${clubLetters}<rect x="218" y="56" width="756" height="1176" fill="none" stroke="${C.foil}" stroke-width="6"/>
      <path d="M242 76 H954 V1212 H242" fill="none" stroke="${accent}" stroke-width="3"/>
      <path d="M218 1238 H974 V1332 H246 Z" fill="${accent}"/>
      <text x="276" y="1298" font-family="Oswald" font-weight="700" font-size="${fit(name, 676, 54)}" fill="${C.ink}">${esc(name)}</text>
      <text x="130" y="1298" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${fit(pos, 150, 38)}" fill="${C.ink}">${esc(pos)}</text>` : ''}
    ${stats.map(([label, value], i) => `<text x="${54 + 916 / stats.length * (i + 0.5)}" y="1363" text-anchor="middle" font-family="Oswald" font-size="24" font-weight="700" fill="${C.ink}">${esc(value)}</text><text x="${54 + 916 / stats.length * (i + 0.5)}" y="1384" text-anchor="middle" font-family="Oswald" font-size="13" fill="${C.ink}">${esc(label)}</text>`).join('')}
    <text x="512" y="1414" text-anchor="middle" font-family="Inter" font-size="12" fill="${C.ink}">${stats.length ? 'EA MATCH DATA · ' : ''}AI VIRTUAL PRO ART · GAFFERBOT STUDIO</text>
  </svg>`);
}
module.exports = { render1990sCard };