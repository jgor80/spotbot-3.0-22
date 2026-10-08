// Palermo kit catalog, scoped to Palermo-named clubs only. Other clubs keep their saved club.kit.
// Vintage card styles pair with a matching era kit; members can override per graphic.
const PALERMO = [
  { key: 'home', label: 'Home 2024–25', era: 'modern', primary: 'pale pink', secondary: 'black',
    description: 'pale pink shirt with dark pink and black diagonal slash brushstrokes, black V-neck collar and cuffs, black shorts with pink side panels' },
  { key: 'away', label: 'Away 2024–25 (Citrus Grove)', era: 'modern', primary: 'peach', secondary: 'lime yellow',
    description: 'warm peach shirt with a Sicilian citrus and orange-blossom botanical print, lime-yellow crew collar and cuffs, peach shorts with lime side panels' },
  { key: 'third', label: 'Third 2024–25 (Anthracite)', era: 'modern', primary: 'anthracite black', secondary: 'pale pink',
    description: 'dark anthracite shirt with pale pink henley button collar and cuffs, thin aqua-mint trim, anthracite shorts with pink side panels' },
  { key: 'retro1979', label: '1979 Vintage (Pouchain)', era: 'vintage', primary: 'pink', secondary: 'black',
    description: 'late-1970s cotton shirt: pink body with two wide horizontal black bands across the chest and shoulders, white V-neck collar, white sleeves with twin pink stripes, round white eagle badge patch, black shorts' },
  { key: 'retro1986', label: '1986 Classic', era: 'vintage', primary: 'pink', secondary: 'black',
    description: 'mid-1980s plain pink shirt with black knitted polo collar and V insert, black cuffs, black shorts' },
  { key: 'retro1990s', label: '1990s Geometric', era: 'vintage', primary: 'pink', secondary: 'black',
    description: 'baggy 1990s pink shirt with tonal diamond and zigzag sublimated pattern, big black polo collar, black shorts' },
  { key: 'retro2000s', label: '2000s Y2K', era: 'vintage', primary: 'pink', secondary: 'black',
    description: 'early-2000s pink shirt with satin sheen and bold black side panels down the flanks, black crew collar, black shorts' },
];
const STYLE_KIT = {
  retro1960s: 'retro1979', retro1970s: 'retro1979', sicilia: 'retro1979', vintage: 'retro1979',
  retro1986: 'retro1986', retro1990s: 'retro1990s', y2k: 'retro2000s',
};
function kitsFor(club) {
  return /palermo/i.test(club?.name || '') ? PALERMO : [];
}
// Returns the kit to draw for this style; falls back to the club's saved kit.
function kitFor(club, style, key) {
  const kits = kitsFor(club);
  if (!kits.length) return club?.kit || {};
  const k = kits.find((x) => x.key === key) || kits.find((x) => x.key === (STYLE_KIT[style] || 'home'));
  return { primary: k.primary, secondary: k.secondary, description: k.description, label: k.label, key: k.key };
}
function withKit(club, style, key) {
  return club ? { ...club, kit: kitFor(club, style, key) } : club;
}
module.exports = { kitsFor, kitFor, withKit, STYLE_KIT };
