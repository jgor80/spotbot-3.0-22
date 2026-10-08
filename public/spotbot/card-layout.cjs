// Remove the unused stat band without stretching artwork or changing print geometry.
function finishCardSvg(svg, d) {
  const source = d.dataLabel || d.seasonLabel || 'EA MATCH DATA';
  svg = svg.replaceAll('EA MATCH DATA · ', `${String(source).replace(/[<>&]/g, '')} · `);
  if (d.stats?.length) return svg;
  const height = Number(svg.match(/<svg[^>]*height="(\d+)"/)?.[1]);
  if (height !== 1434) return svg;
  const compact = d.style === 'retro1986' ? d.tagline ? 1360 : 1334 : 1380;
  // The final text is the provenance footer, not player information.
  svg = svg.replace(/(<text\b[^>]*\by=")(\d+)("[^>]*>[^<]*SPOTBOT STUDIO<\/text>)/, `$1${compact - 20}$3`);
  return svg.replace('height="1434" viewBox="0 0 1024 1434"', `height="${compact}" viewBox="0 0 1024 ${compact}"`);
}
module.exports = { finishCardSvg };