// Remove the unused stat band without stretching artwork or changing print geometry.
function finishCardSvg(svg, d) {
  const source = d.dataLabel || d.seasonLabel || 'EA MATCH DATA';
  svg = svg.replaceAll('EA MATCH DATA · ', `${String(source).replace(/[<>&]/g, '')} · `);
  return d.frame ? addFrame(compactCard(svg, d), d.frame) : compactCard(svg, d);
}

function compactCard(svg, d) {
  if (d.stats?.length) return svg;
  const height = Number(svg.match(/<svg[^>]*height="(\d+)"/)?.[1]);
  if (height !== 1434) return svg;
  const compact = d.style === 'retro1986' ? d.tagline ? 1360 : 1334 : 1380;
  // The final text is the provenance footer, not player information.
  svg = svg.replace(/(<text\b[^>]*\by=")(\d+)("[^>]*>[^<]*GAFFERBOT STUDIO<\/text>)/, `$1${compact - 20}$3`);
  return svg.replace('height="1434" viewBox="0 0 1024 1434"', `height="${compact}" viewBox="0 0 1024 ${compact}"`);
}

// A badge frame the player chose to wear (rare, epic or legendary): a tier-coloured border and the
// badge's name on a ribbon at the top. frame: { name, glyph, tier }
const FRAME_COLORS = { rare: ['#38bdf8', '#e0f2fe'], epic: ['#a855f7', '#f3e8ff'], legendary: ['#facc15', '#fef9c3'] };
function addFrame(svg, frame) {
  const [fill, light] = FRAME_COLORS[frame.tier] || FRAME_COLORS.rare;
  const view = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  if (!view) return svg;
  const W = Number(view[1]);
  const H = Number(view[2]);
  const label = String(frame.name || '').toUpperCase().replace(/[<>&]/g, '').slice(0, 24);
  const rw = Math.min(W - 160, 120 + label.length * 17);
  const overlay = `<g>
    <rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="34" fill="none" stroke="${fill}" stroke-width="14"/>
    <rect x="22" y="22" width="${W - 44}" height="${H - 44}" rx="26" fill="none" stroke="${light}" stroke-opacity="0.7" stroke-width="3"/>
    <rect x="${(W - rw) / 2}" y="0" width="${rw}" height="46" rx="12" fill="${fill}"/>
    <text x="${W / 2}" y="32" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="24" letter-spacing="3" fill="#0b1220">${label}</text>
  </g>`;
  return svg.replace(/<\/svg>\s*$/, `${overlay}</svg>`);
}

module.exports = { finishCardSvg, addFrame };
