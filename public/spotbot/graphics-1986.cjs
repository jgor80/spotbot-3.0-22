// Fixed print-card frame; only the virtual-pro artwork varies between editions.
function render1986Card(d, G, accent) {
  const W = 1024, H = 1434;
  const esc = G.esc;
  const club = String(d.clubName || 'PRO CLUBS').toUpperCase().slice(0, 40);
  const name = String(d.name || '').toUpperCase().slice(0, 40);
  const stats = (d.stats || []).slice(0, 6);
  const clubSize = Math.max(38, Math.min(144, Math.floor(900 / Math.max(club.length * 0.62, 1))));
  const nameSize = Math.max(24, Math.min(60, Math.floor(904 / Math.max(name.length * 0.66, 1))));
  const cells = 900 / Math.max(stats.length, 1);
  return G.render(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><clipPath id="photo1986"><rect x="54" y="190" width="916" height="1000"/></clipPath></defs>
    <rect width="1024" height="1434" fill="#fafaf7"/>
    <rect x="24" y="24" width="976" height="1178" fill="#111111"/>
    <text x="512" y="150" text-anchor="middle" font-family="Inter" font-weight="900" font-size="${clubSize}" fill="${accent}" textLength="900" lengthAdjust="spacingAndGlyphs">${esc(club)}</text>
    <rect x="54" y="190" width="916" height="1000" fill="#525a60"/>
    ${d.art ? `<image href="${d.art}" x="54" y="190" width="916" height="1000" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo1986)"/>` : ''}
    ${d.crest ? `<image href="${d.crest}" x="856" y="220" width="80" height="80" preserveAspectRatio="xMidYMid meet"/>` : ''}
    ${d.position ? `<circle cx="126" cy="1108" r="47" fill="${accent}" stroke="#fafaf7" stroke-width="4"/>
      <text x="126" y="1120" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${String(d.position).length > 3 ? 24 : 32}" fill="#111111">${esc(String(d.position).toUpperCase().slice(0, 5))}</text>` : ''}
    <text x="512" y="1270" text-anchor="middle" font-family="Inter" font-weight="700" font-size="${nameSize}" fill="#111111">${esc(name)}</text>
    ${stats.length ? `<path d="M62 1294H962" stroke="#111111" stroke-width="2"/>
      ${stats.map(([label, value], i) => `<text x="${62 + cells * (i + 0.5)}" y="1337" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="32" fill="#111111">${esc(value)}</text>
      <text x="${62 + cells * (i + 0.5)}" y="1363" text-anchor="middle" font-family="Inter" font-size="14" fill="#404040">${esc(label)}</text>`).join('')}` :
      `<text x="512" y="1328" text-anchor="middle" font-family="Inter" font-size="20" fill="#404040">${esc(String(d.tagline || '').toUpperCase().slice(0, 60))}</text>`}
    <text x="512" y="1408" text-anchor="middle" font-family="Inter" font-size="13" fill="#404040">${stats.length ? 'EA MATCH DATA · ' : ''}AI VIRTUAL PRO ART · SPOTBOT STUDIO</text>
  </svg>`);
}
module.exports = { render1986Card };