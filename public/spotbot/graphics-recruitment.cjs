// Recruitment lettering is editable and rendered locally, never invented in AI art.
function recruitmentPoster(d, G, p) {
  const W = 1024, H = 1536, esc = G.esc;
  const vintage = /vintage|sicilia|retro19/.test(d.style);
  const bg = vintage ? '#efe4cc' : p.panel || '#080a10';
  const ink = vintage ? '#221d1b' : p.ink || '#ffffff';
  const accent = p.accent || '#e98bb5', sub = vintage ? '#554a42' : p.sub || '#cad3dd';
  const fit = (s, max) => Math.min(max, Math.floor(864 / Math.max(String(s).length * 0.56, 1)));
  const lines = (s, limit = 50) => {
    const out = []; let line = '';
    for (const word of String(s || '').split(/\s+/).filter(Boolean)) {
      if ((line + ' ' + word).trim().length > limit && line) { out.push(line); line = word; }
      else line = (line + ' ' + word).trim();
    }
    if (line) out.push(line);
    return out.slice(0, 3);
  };
  const details = lines(d.details);
  const contact = lines(d.contact, 55).slice(0, 2);
  const detailY = contact.length ? 1280 : 1330;
  const decoration = d.style === 'synthwave' ? `<defs><pattern id="rg" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M64 0H0V64" fill="none" stroke="${sub}" stroke-opacity=".25"/></pattern></defs><rect width="1024" height="1536" fill="url(#rg)"/>`
    : d.style === 'cyber' ? `<path d="M32 240H992M32 1040H992" stroke="${accent}" stroke-width="14" stroke-dasharray="24 12"/>`
    : /chrome|y2k|2020|2010/.test(d.style) ? `<defs><linearGradient id="rf"><stop stop-color="${accent}"/><stop offset=".5" stop-color="#edf5ff"/><stop offset="1" stop-color="${sub}"/></linearGradient></defs><rect x="24" y="24" width="976" height="1488" rx="32" fill="none" stroke="url(#rf)" stroke-width="14"/>`
    : vintage ? `<rect x="25" y="25" width="974" height="1486" fill="none" stroke="${ink}" stroke-width="4"/><rect x="37" y="37" width="950" height="1462" fill="none" stroke="${accent}" stroke-width="2" stroke-dasharray="3 5"/>`
    : `<path d="M32 240H992M32 1040H992" stroke="${accent}" stroke-width="5"/>`;
  return G.render(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${bg}"/>${decoration}
    ${d.crest ? `<image href="${d.crest}" x="66" y="66" width="140" height="140" preserveAspectRatio="xMidYMid meet"/>` : ''}
    <text x="${d.crest ? 238 : 80}" y="142" font-family="Oswald" font-weight="700" font-size="${Math.min(64, Math.floor((d.crest ? 706 : 864) / Math.max(d.clubName.length * .56, 1)))}" fill="${ink}">${esc(d.clubName.toUpperCase())}</text>
    <text x="${d.crest ? 238 : 80}" y="192" font-family="Inter" font-size="22" fill="${accent}">RECRUITMENT · PRO CLUBS</text>
    ${d.art ? `<image href="${d.art}" x="50" y="260" width="924" height="770" preserveAspectRatio="xMidYMin slice"/>` : ''}
    <rect x="50" y="1048" width="924" height="420" fill="${bg}"/>
    <text x="80" y="1134" font-family="Oswald" font-weight="700" font-size="${fit(d.headline, 88)}" fill="${ink}">${esc(d.headline.toUpperCase())}</text>
    ${d.positions ? `<text x="80" y="1210" font-family="Oswald" font-weight="700" font-size="${fit(d.positions, 46)}" fill="${accent}">${esc(d.positions.toUpperCase())}</text>` : ''}
    ${details.map((l, i) => `<text x="80" y="${detailY + i * 34}" font-family="Inter" font-size="${fit(l, 27)}" fill="${sub}">${esc(l)}</text>`).join('')}
    ${contact.map((l, i) => `<text x="80" y="${1410 + i * 32}" font-family="Inter" font-weight="700" font-size="${fit(l, 25)}" fill="${ink}">${esc(l)}</text>`).join('')}
    <text x="512" y="1490" text-anchor="middle" font-family="Inter" font-size="13" fill="${sub}">AI VIRTUAL PRO ART · SPOTBOT STUDIO</text>
  </svg>`);
}
module.exports = { recruitmentPoster };