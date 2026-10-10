// Three mid-century print frames, selected by the existing edition composition.
function render1960sCard(d, G, accent) {
  const C = { paper: '#f4eddc', ink: '#192422', field: '#b64132', teal: '#187c8a', gold: '#e6bb4d', light: '#fff4ca' };
  const oval = d.composition === 'editorial';
  const pennant = d.composition === 'side-panel';
  const esc = G.esc;
  const name = String(d.name || '').toUpperCase().slice(0, 40);
  const club = String(d.clubName || 'PRO CLUBS').toUpperCase().slice(0, 40);
  const pos = String(d.position || '').toUpperCase().slice(0, 12);
  const size = (t, w, max) => Math.max(20, Math.min(max, Math.floor(w / Math.max(t.length * 0.6, 1))));
  const stats = (d.stats || []).slice(0, 6);
  const cells = 900 / Math.max(stats.length, 1);
  const lift = stats.length ? 0 : 48;
  const shape = oval ? `<ellipse cx="512" cy="${651 + lift / 2}" rx="446" ry="${460 + lift / 2}"/>` : `<rect x="54" y="${pennant ? 54 : 74}" width="916" height="${(pennant ? 1020 : 1000) + lift}" rx="${pennant ? 62 : 0}"/>`;
  const photoY = oval ? 191 : pennant ? 54 : 74;
  const photoH = (oval ? 920 : pennant ? 1020 : 1000) + lift;
  const strip = oval ? C.field : pennant ? C.gold : C.teal;
  const nameInk = oval ? C.light : pennant ? C.ink : C.gold;
  return G.render(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1434" viewBox="0 0 1024 1434">
    <defs>
      <clipPath id="portrait60">${shape}</clipPath>
      <pattern id="paper60" width="13" height="17" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r="0.7" fill="${C.ink}" opacity="0.07"/><circle cx="9" cy="12" r="0.6" fill="${C.paper}" opacity="0.14"/></pattern>
    </defs>
    <rect width="1024" height="1434" fill="${C.paper}"/>
    <rect x="30" y="30" width="964" height="1320" fill="${oval ? C.field : C.gold}"/>
    <g fill="${C.teal}">${shape}</g>
    ${d.art ? `<image href="${d.art}" x="54" y="${photoY}" width="916" height="${photoH}" preserveAspectRatio="xMidYMin slice" clip-path="url(#portrait60)"/>` : ''}
    ${oval ? `<text x="512" y="140" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${size(name, 840, 80)}" fill="${C.paper}">${esc(name)}</text>` : ''}
    ${pennant ? `<path d="M64 972 Q246 900 612 977 L550 1103 Q303 1048 82 1153 Z" fill="${C.ink}"/>
      <path d="M80 979 Q247 920 586 986 L533 1080 Q293 1032 95 1127 Z" fill="${accent}"/>
      <text x="313" y="1022" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${size(club, 390, 48)}" fill="${C.ink}">${esc(club)}</text>` : ''}
    <rect x="${oval ? 54 : 30}" y="${1156 + lift}" width="${oval ? 916 : 964}" height="${194 - lift}" fill="${strip}"/>
    ${oval && d.crest ? `<image href="${d.crest}" x="72" y="${1174 + lift}" width="84" height="84" preserveAspectRatio="xMidYMid meet"/>` : ''}
    <text x="${oval ? 190 : 60}" y="${(oval ? 1207 : 1219) + lift}" font-family="${oval ? 'Oswald' : 'Inter'}" font-weight="700" font-size="${size(oval ? club : name, oval ? 750 : 900, oval ? 36 : 64)}" fill="${nameInk}">${esc(oval ? club : name)}</text>
    <text x="${oval ? 190 : 60}" y="${1260 + lift}" font-family="Oswald" font-size="${size(oval ? pos : club, 690, 30)}" fill="${nameInk}">${esc(oval ? pos : club)}</text>
    ${!oval && pos ? `<text x="960" y="${1260 + lift}" text-anchor="end" font-family="Oswald" font-size="26" fill="${nameInk}">${esc(pos)}</text>` : ''}
    ${stats.length ? stats.map(([label, value], i) => `<text x="${62 + cells * (i + 0.5)}" y="1302" text-anchor="middle" font-family="Oswald" font-size="26" font-weight="700" fill="${nameInk}">${esc(value)}</text><text x="${62 + cells * (i + 0.5)}" y="1326" text-anchor="middle" font-family="Oswald" font-size="15" fill="${nameInk}">${esc(label)}</text>`).join('') : ''}
    <rect x="30" y="30" width="964" height="1320" fill="url(#paper60)"/>
    <text x="512" y="1402" text-anchor="middle" font-family="Inter" font-size="13" fill="${C.ink}">${stats.length ? 'EA MATCH DATA · ' : ''}AI VIRTUAL PRO ART · GAFFERBOT STUDIO</text>
  </svg>`);
}
module.exports = { render1960sCard };