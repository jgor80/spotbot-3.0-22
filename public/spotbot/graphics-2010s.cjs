// 2010s club editions: dark chrome, sweeping colour ribbon and textured foil.
function render2010sCard(d, G, accent) {
  const C = { paper: '#f7f8f6', ink: '#10191c', silver: '#c6d5da', dark: '#526169', light: '#ffffff', foil: '#dfc788' };
  const esc = G.esc;
  const ribbon = d.composition === 'editorial';
  const foil = d.composition === 'side-panel';
  const name = String(d.name || '').toUpperCase().slice(0, 40);
  const club = String(d.clubName || 'PRO CLUBS').toUpperCase().slice(0, 40);
  const pos = String(d.position || '').toUpperCase().slice(0, 12);
  const fit = (text, width, max) => Math.max(18, Math.min(max, Math.floor(width / Math.max(text.length * 0.62, 1))));
  const stats = (d.stats || []).slice(0, 6);
  const photo = `<rect x="62" y="62" width="900" height="1240" rx="${ribbon ? 0 : foil ? 20 : 86}"/>`;
  const badge = (x, y, size) => d.crest ? `<image href="${d.crest}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>` : `<text x="${x + size / 2}" y="${y + size * 0.67}" text-anchor="middle" font-family="Oswald" font-size="${size * 0.46}" font-weight="700" fill="${C.light}">FC</text>`;
  return G.render(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1434" viewBox="0 0 1024 1434">
    <defs>
      <clipPath id="portrait10">${photo}</clipPath>
      <linearGradient id="chrome10" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${C.dark}"/><stop offset="0.22" stop-color="${C.light}"/><stop offset="0.46" stop-color="${C.silver}"/><stop offset="0.51" stop-color="${C.dark}"/><stop offset="0.62" stop-color="${C.light}"/><stop offset="1" stop-color="${C.dark}"/></linearGradient>
      <linearGradient id="clubSweep10" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${accent}"/><stop offset="0.58" stop-color="${accent}"/><stop offset="1" stop-color="${C.light}"/></linearGradient>
      <linearGradient id="shade10" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${C.ink}" stop-opacity="0"/><stop offset="1" stop-color="${C.ink}" stop-opacity="0.97"/></linearGradient>
      <pattern id="foilGrain10" width="31" height="29" patternUnits="userSpaceOnUse"><path d="M3 5 L9 9 M21 17 L27 20" stroke="${C.foil}" stroke-width="2" opacity="0.6"/><circle cx="14" cy="22" r="1.5" fill="${C.light}" opacity="0.7"/><circle cx="27" cy="3" r="2" fill="${accent}" opacity="0.35"/></pattern>
    </defs>
    <rect width="1024" height="1434" fill="${ribbon || foil ? C.paper : C.ink}"/>
    ${foil ? `<rect x="24" y="24" width="976" height="1306" fill="url(#chrome10)"/><rect x="24" y="24" width="976" height="1306" fill="url(#foilGrain10)"/>` : ''}
    <g fill="${C.ink}">${photo}</g>
    ${d.art ? `<image href="${d.art}" x="62" y="62" width="900" height="1240" preserveAspectRatio="xMidYMin slice" clip-path="url(#portrait10)"/>` : ''}
    <rect x="62" y="1000" width="900" height="302" fill="url(#shade10)" clip-path="url(#portrait10)"/>
    <g fill="none" stroke="${foil ? C.foil : ribbon ? C.paper : 'url(#chrome10)'}" stroke-width="10">${photo}</g>
    ${!ribbon && !foil ? `<rect x="49" y="49" width="926" height="1266" rx="98" fill="none" stroke="${C.silver}" stroke-width="2"/>
      <text x="912" y="139" text-anchor="end" font-family="Oswald" font-size="${fit(club, 804, 68)}" font-weight="700" fill="${C.ink}" stroke="${accent}" stroke-width="2" paint-order="stroke">${esc(club)}</text>
      <path d="M202 1076 L330 1182 L202 1288 L74 1182 Z" fill="${C.ink}" stroke="${accent}" stroke-width="5"/>
      ${badge(137, 1117, 130)}
      <path d="M310 1266 H834" stroke="${accent}" stroke-width="4"/>
      <text x="794" y="1235" text-anchor="end" font-family="Oswald" font-style="italic" font-weight="700" font-size="${fit(name, 450, 64)}" fill="${C.light}">${esc(name)}</text>
      <circle cx="895" cy="1230" r="40" fill="${C.ink}" stroke="url(#chrome10)" stroke-width="4"/>
      <text x="895" y="1244" text-anchor="middle" font-family="Oswald" font-size="${fit(pos, 65, 28)}" fill="${C.light}">${esc(pos)}</text>` : ''}
    ${ribbon ? `<path d="M62 62 H323 L62 344 Z" fill="url(#clubSweep10)" opacity="0.9"/>
      <path d="M62 1100 C300 992 602 1268 962 1090 V1302 H62 Z" fill="url(#clubSweep10)"/>
      <path d="M62 1124 C330 1040 640 1306 962 1114" fill="none" stroke="${C.light}" stroke-width="5"/>
      <text x="104" y="1200" font-family="Oswald" font-weight="700" font-size="${fit(club, 795, 76)}" fill="${C.ink}" stroke="${C.light}" stroke-width="1.5" paint-order="stroke">${esc(club)}</text>
      <path d="M300 1232 H962 V1302 H270 Z" fill="${C.ink}"/>
      <text x="925" y="1282" text-anchor="end" font-family="Oswald" font-weight="700" font-size="${fit(name, 616, 48)}" fill="${C.light}">${esc(name)}</text>
      <text x="103" y="1283" font-family="Oswald" font-size="${fit(pos, 150, 34)}" fill="${C.ink}">${esc(pos)}</text>` : ''}
    ${foil ? `<rect x="63" y="1137" width="898" height="165" fill="url(#shade10)"/>
      <rect x="63" y="1137" width="898" height="165" fill="url(#foilGrain10)"/>
      <path d="M85 1160 H785 M85 1232 H785" stroke="${C.foil}" stroke-width="2"/>
      <text x="86" y="1214" font-family="Oswald" font-weight="700" font-size="${fit(name, 630, 56)}" fill="${C.light}">${esc(name)}</text>
      <text x="86" y="1276" font-family="Oswald" font-size="${fit(club, 600, 28)}" fill="${C.light}">${esc(club)}</text>
      <circle cx="747" cy="1264" r="28" fill="${C.foil}"/>
      <text x="747" y="1273" text-anchor="middle" font-family="Oswald" font-size="${fit(pos, 46, 22)}" font-weight="700" fill="${C.ink}">${esc(pos)}</text>
      <rect x="805" y="1161" width="130" height="130" rx="18" fill="${C.ink}" stroke="${C.foil}" stroke-width="3"/>
      ${badge(825, 1181, 90)}` : ''}
    ${stats.map(([label, value], i) => `<text x="${54 + 916 / stats.length * (i + 0.5)}" y="1364" text-anchor="middle" font-family="Oswald" font-size="24" font-weight="700" fill="${ribbon || foil ? C.ink : C.light}">${esc(value)}</text><text x="${54 + 916 / stats.length * (i + 0.5)}" y="1385" text-anchor="middle" font-family="Oswald" font-size="13" fill="${ribbon || foil ? C.ink : C.light}">${esc(label)}</text>`).join('')}
    <text x="512" y="1416" text-anchor="middle" font-family="Inter" font-size="12" fill="${ribbon || foil ? C.ink : C.light}">${stats.length ? 'EA MATCH DATA · ' : ''}AI VIRTUAL PRO ART · GAFFERBOT STUDIO</text>
  </svg>`);
}
module.exports = { render2010sCard };