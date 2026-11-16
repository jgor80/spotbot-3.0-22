'use strict';
// A member's saved Build lab build (player_builds, written from gafferbot.app/build) on their Studio cards:
// - buildStats(): the six in-match group ratings, used as the card's stat lines ("With My Build" cards)
// - renderBuildBack(): a card back with every attribute, the body, PlayStyles and Specialization
// All numbers come from the saved build through the same rules as the website (pro-build.cjs is
// generated from src/lib/proBuild.ts by npm run build:bot-probuild), so the card always matches /build.

const P = require('./pro-build.cjs');

const GROUP_COLORS = { pace: '#22d3ee', shooting: '#fb7185', passing: '#fbbf24', dribbling: '#a78bfa', defending: '#34d399', physical: '#fb923c', goalkeeping: '#60a5fa' };
const PAPER = new Set(['vintage', 'retro1960s', 'retro1970s', 'retro1986', 'retro1990s', 'sunday', 'mud', 'heritage']);

function theme(style, accent) {
  if (PAPER.has(style)) return { bg: '#efe4c8', panel: '#f8f0dc', ink: '#2a1d12', sub: '#6b5a42', accent: accent || '#c8553d', line: '#2a1d12', head: '#2a1d12', headInk: '#f8f0dc', track: '#2a1d12' };
  return { bg: '#0b0f17', panel: '#121a28', ink: '#f4f6fb', sub: '#9aa6bd', accent: accent || '#22c55e', line: '#2a3446', head: accent || '#22c55e', headInk: '#0b0f17', track: '#ffffff' };
}

// The member's build picked for their cards (on_cards), or null (a missing table or bad code never blocks a card).
// Their saved masteries and club facility boosts (player_build_profiles) and the levels of all their saved builds
// are applied on top, the same way the website does (applyProfile).
const quiet = (q) => q.then((r) => r, () => ({ data: null }));
async function loadBuild(supabase, userId) {
  if (!supabase || !userId) return null;
  const { data } = await quiet(supabase.from('player_builds').select('code, units').eq('discord_user_id', userId).eq('on_cards', true).maybeSingle());
  const build = data?.code ? P.decodeBuild(data.code) : null;
  if (!build) return null;
  const [{ data: prof }, { data: rows }] = await Promise.all([
    quiet(supabase.from('player_build_profiles').select('mastery_levels, boosts').eq('discord_user_id', userId).maybeSingle()),
    quiet(supabase.from('player_builds').select('archetype, level').eq('discord_user_id', userId)),
  ]);
  const levels = {};
  for (const r of rows || []) levels[r.archetype] = Math.max(levels[r.archetype] || 0, Number(r.level) || 0);
  const withProfile = prof ? P.applyProfile(build, { masteryLevels: prof.mastery_levels, boosts: prof.boosts }, levels) : P.applyProfile(build, { masteryLevels: build.masteryLevels, boosts: build.boosts }, levels);
  return { build: withProfile, units: data.units === 'metric' ? 'metric' : 'imperial' };
}

const archetypeOf = (b) => P.ARCHETYPES.find((a) => a.key === b.archetype) || P.ARCHETYPES[0];
// Keepers lead with their keeping attributes
const groupsFor = (b) => P.ATTR_GROUPS.filter((g) => P.ATTRIBUTES.some((a) => a.group === g.key && P.trainable(b.archetype, a.key)))
  .sort((x, y) => (y.key === 'goalkeeping') - (x.key === 'goalkeeping'));

// Six stat lines for a card front: in-match group averages (keepers: their five keeping attributes + physical)
function buildStats(b) {
  const fx = P.bodyEffects(b);
  if (P.isKeeper(b.archetype)) {
    const keys = [['DIVING', 'gkDiving'], ['HANDLING', 'gkHandling'], ['KICKING', 'gkKicking'], ['REFLEXES', 'gkReflexes'], ['POSITIONING', 'gkPositioning']];
    const avg = P.groupAverages(b);
    return [...keys.map(([l, k]) => [l, String(P.matchValue(b, k, fx))]), ['PHYSICAL', String(Math.round(avg.physical))]];
  }
  const avg = P.groupAverages(b);
  return ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'].map((g) => [g.toUpperCase(), String(Math.round(avg[g]))]);
}

// Card-front labels for a build card
function buildLabels(b) {
  const arch = archetypeOf(b);
  return { seasonLabel: `${arch.name.toUpperCase()} BUILD`, tagline: `Level ${b.level} ${arch.name}${b.specialization ? ` · ${(P.SPECIALIZATIONS.find((s) => s.key === b.specialization) || {}).name || ''}` : ''}`.slice(0, 60) };
}

function renderBuildBack(d, G) {
  const esc = G.esc;
  const b = d.build;
  const t = theme(d.style, d.accent);
  const W = 1434, H = 1024;
  const units = d.units === 'metric' ? 'metric' : 'imperial';
  const arch = archetypeOf(b);
  const fx = P.bodyEffects(b);
  const groups = groupsFor(b);
  const avg = P.groupAverages(b);
  const name = String(d.name || 'PLAYER').toUpperCase().slice(0, 28);
  const spec = b.specialization ? P.specializationStatus(b).find((s) => s.spec.key === b.specialization) : null;
  const styles = P.playstyleStatus(b);
  const sigs = styles.filter((s) => s.signature).sort((x, y) => x.signature - y.signature).map((s) => `${s.def.name}${s.plus ? '+' : ''}`);
  const picks = b.playstyles;

  // Attribute grid: 3 columns (4 for keepers, who have a seventh group), 2 rows
  const cols = groups.length > 6 ? 4 : 3;
  const gx = 80, gy = 290, gw = (W - 160) / cols, gh = 262;
  const blocks = groups.map((g, i) => {
    const x = gx + (i % cols) * gw, y = gy + Math.floor(i / cols) * gh;
    const c = GROUP_COLORS[g.key];
    const attrs = P.ATTRIBUTES.filter((a) => a.group === g.key && P.trainable(b.archetype, a.key));
    const rowH = Math.min(31, 196 / Math.max(attrs.length, 1));
    const narrow = cols > 3;
    const barW = narrow ? 56 : 92, barX = x + gw - 72 - barW;
    const rows = attrs.map((a, j) => {
      const v = P.matchValue(b, a.key, fx);
      const ry = y + 62 + j * rowH;
      return `<text x="${x}" y="${ry}" font-family="Inter" font-size="${Math.min(narrow ? 19 : 22, rowH - 6)}" fill="${t.ink}">${esc(a.label)}</text>
        <rect x="${barX}" y="${ry - 12}" width="${barW}" height="8" rx="4" fill="${t.track}" fill-opacity="0.12"/>
        <rect x="${barX}" y="${ry - 12}" width="${Math.max(4, barW * Math.max(0, v - 25) / 74)}" height="8" rx="4" fill="${c}"/>
        <text x="${x + gw - 30}" y="${ry}" text-anchor="end" font-family="Oswald" font-weight="700" font-size="${Math.min(26, rowH - 4)}" fill="${t.ink}">${v}</text>`;
    }).join('');
    return `<text x="${x}" y="${y + 20}" font-family="Oswald" font-weight="700" font-size="28" letter-spacing="3" fill="${c}">${esc(g.label.toUpperCase())}</text>
      <text x="${x + gw - 30}" y="${y + 22}" text-anchor="end" font-family="Oswald" font-weight="700" font-size="34" fill="${c}">${Math.round(avg[g.key])}</text>
      <line x1="${x}" x2="${x + gw - 30}" y1="${y + 34}" y2="${y + 34}" stroke="${c}" stroke-opacity="0.5" stroke-width="2"/>${rows}`;
  }).join('');

  const info = [
    `LEVEL ${b.level}`,
    `${P.formatHeight(b.heightCm, units)} · ${P.formatWeight(b.weightKg, units)}`,
    P.accelerate(b, fx).type.toUpperCase(),
    `SM ${b.skillMoves} · WF ${b.weakFoot}`,
  ];
  const chip = (text, x, y, sig) => {
    const w = Math.max(90, text.length * 14 + 40);
    return { w, svg: `<rect x="${x}" y="${y - 30}" width="${w}" height="42" rx="21" fill="${sig ? '#fbbf24' : t.accent}" fill-opacity="${sig ? 0.22 : 0.16}" stroke="${sig ? '#fbbf24' : t.accent}" stroke-opacity="0.7"/>
      <text x="${x + w / 2}" y="${y - 2}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="20" fill="${t.ink}">${sig ? '◆ ' : ''}${esc(text)}</text>` };
  };
  let cx = 80;
  const chips = [...sigs.map((s) => [s, true]), ...(spec && spec.met ? [[`${spec.spec.plus}+`, true]] : []), ...picks.map((p) => [p, false])].map(([text, sig]) => {
    const c = chip(text, cx, 908, sig);
    if (cx + c.w > W - 80) return '';
    cx += c.w + 14;
    return c.svg;
  }).join('');

  return G.render(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${t.bg}"/>
    <rect x="30" y="30" width="${W - 60}" height="${H - 60}" fill="${t.panel}" stroke="${t.accent}" stroke-width="6"/>
    <rect x="30" y="30" width="${W - 60}" height="140" fill="${t.head}"/>
    <circle cx="130" cy="100" r="46" fill="${t.headInk}"/>
    <text x="130" y="117" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="44" fill="${t.head}">${esc(/^\d{1,2}$/.test(String(d.number || '')) ? d.number : String(d.position || arch.line).toUpperCase().slice(0, 3))}</text>
    <text x="200" y="122" font-family="Oswald" font-weight="700" font-size="${Math.min(64, Math.floor(820 / Math.max(name.length * 0.55, 1)))}" fill="${t.headInk}">${esc(name)}</text>
    <text x="1360" y="92" text-anchor="end" font-family="Oswald" font-size="28" letter-spacing="4" fill="${t.headInk}">${esc(String(d.clubName || '').toUpperCase().slice(0, 28))}</text>
    <text x="1360" y="134" text-anchor="end" font-family="Oswald" font-size="24" letter-spacing="4" fill="${t.headInk}">${esc(`${arch.name.toUpperCase()} BUILD`)}</text>
    <text x="80" y="232" font-family="Oswald" font-weight="700" font-size="30" letter-spacing="6" fill="${t.accent}">${esc(spec ? `SPECIALIZATION · ${spec.spec.name.toUpperCase()}${spec.met ? '' : ' (IN PROGRESS)'}` : 'VIRTUAL PRO BUILD')}</text>
    <text x="1354" y="232" text-anchor="end" font-family="Oswald" font-size="26" letter-spacing="2" fill="${t.sub}">${esc(info.join('  ·  '))}</text>
    ${blocks}
    <text x="80" y="850" font-family="Oswald" font-weight="700" font-size="24" letter-spacing="4" fill="${t.sub}">PLAYSTYLES</text>
    ${chips}
    <text x="717" y="972" text-anchor="middle" font-family="Inter" font-size="18" fill="${t.sub}">${esc(`In-match values: height, weight${Object.keys(b.boosts || {}).length ? ', club facilities' : ''} and masteries included · FC 27 build from gafferbot.app/build · GAFFERBOT STUDIO`)}</text>
  </svg>`);
}

module.exports = { loadBuild, buildStats, buildLabels, renderBuildBack, theme };
