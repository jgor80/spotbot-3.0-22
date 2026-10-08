// Uploaded Palermo identities are scoped to Palermo, never another club.
const choices = [
  ['current', 'Current Palermo logo (2019–present)', 'palermo-logo-current'],
  ['eagle', 'Palermo eagle lettering (2019–present)', 'palermo-logo-43'],
  ['shield', 'Pink and black shield (2010s-inspired custom)', 'palermo-logo-44'],
  ['heritage', 'Vintage gold shield (2000–2019-inspired custom)', 'palermo-logo-45'],
  ['compass', 'Vintage compass football (1924–1935)', 'palermo-logo-46'],
  ['diamond', 'Green diamond eagle (1979–1987)', 'palermo-logo-47'],
].map(([key, label, file]) => ({ key, label, url: require(`./assets/${file}.png.asset.json`).url }));
function logosFor(club) {
  return /palermo/i.test(club?.name || '') ? choices : [];
}
function logoFor(club, style, key) {
  const logos = logosFor(club);
  const preferred = key && logos.find((l) => l.key === key);
  return preferred || logos.find((l) => l.key === (/vintage|sicilia|retro19/.test(style || '') ? 'heritage' : 'current')) || null;
}
function assetUrl(url) {
  return url.startsWith('/') ? `https://spotbot3.lovable.app${url}` : url;
}
module.exports = { logosFor, logoFor, assetUrl };