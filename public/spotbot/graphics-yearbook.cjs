// 1990s yearbook card: a tight school-portrait headshot on a mottled laser backdrop, mounted on a
// yearbook page with photo corners and a typed caption. Every word comes from saved card data;
// the artwork is a text-free head-and-shoulders portrait requested with the "headshot" pose.
function renderYearbookCard(d, G, accent) {
  const W = 1024, H = 1434;
  const esc = G.esc;
  const up = (s, n) => String(s || '').toUpperCase().slice(0, n);
  const club = up(d.clubName || 'PRO CLUBS', 40), name = up(d.name, 40);
  const stats = (d.stats || []).slice(0, 6);
  const nameSize = Math.max(28, Math.min(64, Math.floor(820 / Math.max(name.length * 0.62, 1))));
  const clubSize = Math.max(26, Math.min(46, Math.floor(620 / Math.max(club.length * 0.6, 1))));
  const caption = [d.position && up(d.position, 10), d.number && `#${d.number}`, d.seasonLabel && up(d.seasonLabel, 24)].filter(Boolean).join('  ·  ');
  // The portrait is zoomed slightly from the top centre so the face, not the shoulders, fills the frame.
  const px = 132, py = 176, pw = 760, ph = 950;
  return G.render(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <filter id="ybPaper"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0.08 0"/></filter>
      <filter id="ybLaser" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency="0.006 0.012" numOctaves="3" seed="19" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0.62  0 0 0 0 0.55  0 0 0 0 1  0 0 0 0.75 0"/></filter>
      <radialGradient id="ybBack" cx="0.5" cy="0.38" r="0.75"><stop stop-color="#7d9be0"/><stop offset="0.55" stop-color="#3f4fa8"/><stop offset="1" stop-color="#1d1f5c"/></radialGradient>
      <radialGradient id="ybFlash" cx="0.5" cy="0.32" r="0.6"><stop stop-color="#ffffff" stop-opacity="0.18"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
      <filter id="ybGrain"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="1" seed="3"/><feColorMatrix type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.12 0"/></filter>
      <filter id="ybShadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.28"/></filter>
      <clipPath id="ybPhoto"><rect x="${px}" y="${py}" width="${pw}" height="${ph}"/></clipPath>
    </defs>
    <rect width="${W}" height="${H}" fill="#f3efe6"/><rect width="${W}" height="${H}" filter="url(#ybPaper)"/>
    <text x="${px}" y="104" font-family="Oswald" font-weight="700" font-size="${clubSize}" letter-spacing="3" fill="#1f2a5a">${esc(club)}</text>
    <text x="${px + pw}" y="104" text-anchor="end" font-family="Inter" font-weight="700" font-size="20" letter-spacing="5" fill="#6b6f80">YEARBOOK</text>
    <rect x="${px}" y="124" width="${pw}" height="4" fill="${accent}"/><rect x="${px}" y="134" width="${pw}" height="1.5" fill="#1f2a5a" opacity="0.5"/>
    <g filter="url(#ybShadow)"><rect x="${px - 16}" y="${py - 16}" width="${pw + 32}" height="${ph + 32}" fill="#ffffff"/></g>
    <g clip-path="url(#ybPhoto)">
      <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="url(#ybBack)"/><rect x="${px}" y="${py}" width="${pw}" height="${ph}" filter="url(#ybLaser)"/>
      ${d.art ? `<image href="${d.art}" x="${px - pw * 0.06}" y="${py - ph * 0.02}" width="${pw * 1.12}" height="${ph * 1.12}" preserveAspectRatio="xMidYMin slice"/>` : ''}
      <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="url(#ybFlash)"/><rect x="${px}" y="${py}" width="${pw}" height="${ph}" filter="url(#ybGrain)"/>
    </g>
    <rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="none" stroke="#1b1b1b" stroke-opacity="0.35" stroke-width="1.5"/>
    ${[[px - 16, py - 16, 1, 1], [px + pw + 16, py - 16, -1, 1], [px - 16, py + ph + 16, 1, -1], [px + pw + 16, py + ph + 16, -1, -1]]
      .map(([x, y, sx, sy]) => `<path d="M${x} ${y} h${74 * sx} L${x} ${y + 74 * sy} Z" fill="#1c1c22"/>`).join('')}
    ${d.crest ? `<image href="${d.crest}" x="${px + pw - 96}" y="${py + ph + 34}" width="96" height="96" preserveAspectRatio="xMidYMid meet"/>` : ''}
    <text x="${px}" y="${py + ph + 92}" font-family="Inter" font-weight="700" font-size="${nameSize}" letter-spacing="1" fill="#1b1b1b">${esc(name)}</text>
    ${caption ? `<text x="${px}" y="${py + ph + 132}" font-family="Inter" font-weight="700" font-size="22" letter-spacing="4" fill="#4b5563">${esc(caption)}</text>` : ''}
    ${d.tagline ? `<text x="${px}" y="${py + ph + 168}" font-family="Inter" font-style="italic" font-size="20" fill="#4b5563">“${esc(String(d.tagline).slice(0, 60))}”</text>` : ''}
    ${stats.length ? `<path d="M${px} 1336 H${px + pw}" stroke="#1b1b1b" stroke-opacity="0.35" stroke-dasharray="2 5"/>
      <text x="${W / 2}" y="1374" text-anchor="middle" font-family="Inter" font-weight="700" font-size="${stats.length > 4 ? 18 : 21}" letter-spacing="2" fill="#1f2a5a">${stats.map(([l, v]) => `${esc(v)} ${esc(l)}`).join('   ·   ')}</text>` : ''}
    <text x="${W / 2}" y="1416" text-anchor="middle" font-family="Inter" font-size="13" fill="#6b6f80">${stats.length ? 'EA MATCH DATA · ' : ''}AI VIRTUAL PRO ART · GAFFERBOT STUDIO</text>
  </svg>`);
}
module.exports = { renderYearbookCard };
