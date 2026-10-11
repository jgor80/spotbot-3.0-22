// Phrase pools for the Chronicle's postgame writing: verbs, colour, stat puns and opponent-name gags.
// Everything is picked deterministically from a seed (the match id), so a story reads the same if
// reposted but two games rarely read alike. Every line is about one game's own numbers.

const n = (v) => Number(v) || 0;
const nm = (p) => String(p?.ea_username || p?.name || 'Unknown').trim();

function hash(str) {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}
// salt keeps pools independent, so the verb and the pun don't always move together
const pickFrom = (list, seed, salt = '') => list[hash(`${seed}:${salt}`) % list.length];

// What the club did, by the kind of game it was. {o} opponent, {s} score.
const VERBS = {
  demolition: ['dismantled {o} {s}', 'ran riot against {o}, {s}', 'put {o} to the sword, {s}', 'turned {o} into a training cone, {s}', 'made {o} look like a Sunday league side, {s}', 'served {o} a {s} lasagne, extra layers', 'flattened {o} like fresh pasta, {s}'],
  lockdown: ['shut the door on {o}, {s}', 'strangled {o} {s}', 'locked {o} in the cantina and lost the key, {s}', 'smothered {o} {s}', 'gave {o} nothing but fresh air, {s}'],
  shootout: { win: ['outlasted {o} in a {s} shootout', 'won a {s} goal-fest against {o}', 'survived {o} {s} in a game with no brakes'], loss: ['lost a {s} shootout to {o}', 'came off second best in a {s} circus with {o}'], draw: ['traded blows with {o} in a wild {s} draw', 'shared a {s} madhouse with {o}'] },
  'smash-and-grab': ['smash-and-grabbed a {s} win off {o}', 'pickpocketed {o} {s}', 'robbed {o} in broad daylight, {s}', 'stole three points from {o}, {s}, and nobody called the carabinieri'],
  'arm-wrestle': ['edged {o} {s}', 'squeezed past {o}, {s}', 'nicked it {s} against {o}', 'won an arm-wrestle with {o}, {s}', 'got over the line against {o}, {s}, fingernails and all'],
  heartbreaker: ['fell {s} to {o} by a single goal', 'were edged {s} by {o}', 'lost {s} to {o} by the width of a cannoli', 'came within one goal of {o}, {s}'],
  stalemate: ['played out a goalless draw with {o}', 'and {o} cancelled each other out, 0-0', 'shared a 0-0 with {o} that the strikers will want to forget'],
  'trade-off': ['split the points {s} with {o}', 'shared the spoils with {o}, {s}', 'and {o} settled for {s}'],
  collapse: ['were taken apart {s} by {o}', 'had a night to forget, losing {s} to {o}', 'were put through the blender by {o}, {s}', 'got cooked {s} by {o}, al dente at best'],
  win: ['beat {o} {s}', 'took care of {o}, {s}', 'saw off {o} {s}', 'got the job done against {o}, {s}', 'sent {o} home with nothing, {s}'],
  loss: ['fell {s} to {o}', 'came up short against {o}, {s}', 'were beaten {s} by {o}', 'left the points with {o}, {s}'],
};

// One sentence of colour for the game's mood
const FLAVOR = {
  demolition: ['Mamma mia: over by half time in spirit, if not on the clock.', 'The scoreboard operator asked for overtime pay.', "Somewhere, {o}'s keeper is still picking the ball out of the net."],
  lockdown: ['Pure catenaccio; the opposition barely got a sniff.', 'The back line played like a Roman wall, only better maintained.', 'The keeper had time to read a newspaper. Ours, hopefully.'],
  shootout: ['Che partita! Defending was optional; entertainment was not.', 'Both defences were apparently on holiday in Rimini.', 'Cardiologists across the server reported a busy night.'],
  'smash-and-grab': ['A robbery, and a beautiful one.', 'Not pretty, but nobody frames the performance; they frame the points.', '{o} had the ball; we had the goals.'],
  'arm-wrestle': ['Nails were bitten down to the elbow.', 'Ugly, gritty, glorious.', 'Sofferenza, then sweet relief.'],
  heartbreaker: ['One moment either way and this is a different column. Che beffa.', 'So close you could smell the espresso.', 'Football is cruel, and tonight it was very cruel.'],
  stalemate: ['Two goalkeepers will sleep well tonight.', 'A tactical chess match, if both players forgot how to checkmate.', 'Zero goals, plenty of opinions.'],
  'trade-off': ['A point each and an argument for everyone.', 'Nobody leaves happy, nobody leaves hungry.'],
  collapse: ['The film session will be long, and the espresso strong.', 'Burn the tape. Then burn the ashes.', 'A night for the tifosi to watch through their fingers.'],
  win: ['Three points in the bag; the bag is heavier tonight.', 'Business-like, which is the best kind of business.'],
  loss: ['Testa alta; there is always another kick-off.', 'Not the result, not the night.'],
};

// Stat puns: [applies(match, players), line(player)] — the first that fits after a seeded shuffle wins
const STAT_PUNS = [
  [(m, ps) => ps.find((p) => n(p.goals) >= 3), (p) => [`**${nm(p)}** took home the match ball and, frankly, the hat as well.`, `Pass the hat around: **${nm(p)}** went three-for-the-show.`, `**${nm(p)}** with a hat-trick. Milliner's dream, defender's nightmare.`]],
  [(m, ps) => ps.find((p) => n(p.goals) === 2), (p) => [`**${nm(p)}** bagged a brace that would make an orthodontist proud.`, `Two goals for **${nm(p)}**: one for the highlights, one for the ego.`, `**${nm(p)}** scored twice, which is twice more than the opposition wanted.`]],
  [(m, ps) => ps.find((p) => n(p.assists) >= 2), (p) => [`**${nm(p)}** handed out more assists than a Vespa mechanic.`, `**${nm(p)}** was the delivery service tonight: ${n(p.assists)} assists, no extra charge.`, `**${nm(p)}** set the table ${n(p.assists)} times. Buon appetito.`]],
  [(m, ps) => m.scoreAgainst === 0 && ps.find((p) => /^(gk|goalkeeper)$/i.test(String(p.position)) && n(p.saves) >= 2), (p) => [`**${nm(p)}** kept a sheet so clean nonna would hang it in the window.`, `${n(p.saves)} saves from **${nm(p)}**: more stops than a Roman bus.`, `**${nm(p)}** shut up shop. Closed, chiuso, finito.`]],
  [(m, ps) => ps.find((p) => /^(gk|goalkeeper)$/i.test(String(p.position)) && n(p.saves) >= 5), (p) => [`**${nm(p)}** made ${n(p.saves)} saves and still has hands to spare.`, `${n(p.saves)} saves for **${nm(p)}**, who is now accepting applications from octopuses for a job share.`]],
  [(m, ps) => ps.find((p) => n(p.shots) >= 5 && !n(p.goals)), (p) => [`**${nm(p)}** fired ${n(p.shots)} shots and hit everything except the net. The crossbar has filed a complaint.`, `**${nm(p)}**: ${n(p.shots)} shots, zero goals, infinite confidence.`]],
  [(m, ps) => ps.find((p) => n(p.tackles) + n(p.interceptions) >= 8), (p) => [`**${nm(p)}** made ${n(p.tackles) + n(p.interceptions)} tackles and interceptions. Customs officers are taking notes.`, `**${nm(p)}** confiscated the ball ${n(p.tackles) + n(p.interceptions)} times. Nothing got through.`]],
  [(m, ps) => ps.find((p) => n(p.red_cards)), (p) => [`**${nm(p)}** took an early shower. Hopefully the hot water lasted.`, `A red card for **${nm(p)}**, who will be watching the next one from the sofa.`]],
];

// avoid: gamertags already named in the story, so the pun lands on someone else
function statPun(m, seed, avoid = []) {
  const skip = new Set(avoid.map((x) => String(x).toLowerCase()));
  const order = STAT_PUNS.map((x, i) => ({ x, k: hash(`${seed}:pun${i}`) })).sort((a, b) => a.k - b.k).map((o) => o.x);
  const players = (m.players || []).filter((p) => !skip.has(nm(p).toLowerCase()));
  for (const [applies, lines] of order) {
    const p = applies(m, players);
    if (p && p !== true) return pickFrom(lines(p), seed, 'punline');
  }
  return null;
}

// Cheeky gags on the opponent's name: [pattern, lines when we win or draw, lines when we lose].
// Only when a word in the name sets one up; everyone else gets nothing.
const NAME_JOKES = [
  [/\bunited\b/i, ['{o}? United in name only; by the end they were coming apart at the seams.', '{o} arrived united and left divorced.'], ['{o} were united tonight, unfortunately for us, in every sense.']],
  [/\bcity\b/i, ["The city never sleeps, they say. {o}'s defence clearly did.", '{o}: big city, small returns.']],
  [/\brovers?\b/i, ['{o} roved all the way here and went home with empty pockets.', '{o} roved over. Then got rolled over.']],
  [/\bwanderers?\b/i, ['{o} wandered in, wandered about, and wandered off with nothing.', 'Not all who wander are lost. {o} were, though.']],
  [/\brangers?\b/i, ['{o} never found their range. Not even close.', '{o} were out of range all night.']],
  [/\bathletic\b/i, ['{o}: athletic on the team sheet, less so on the pitch.']],
  [/\bd[iy]namo\b/i, ['{o} ran out of batteries well before the final whistle.', '{o}: more dim bulb than dynamo.']],
  [/\breal\b/i, ["{o}? Let's keep it real: second best all night.", '{o} got a reality check.']],
  [/\binter\b/i, ['{o}, interrupted. Rudely.']],
  [/\bsporting\b/i, ['Very sporting of {o} to hand over the points like that.']],
  [/\bballs?\b|\bballers?\b/i, ['{o} brought plenty of balls. We just did more with ours.', "{o} had the balls; we had the finishing."], ['Say what you like about {o}, they had the bigger balls tonight.']],
  [/\bwood(y|s)?\b/i, ['{o} had wood all night and still couldn\'t finish.', '{o} hit the woodwork more than the net. Fitting.']],
  [/\bhard(core)?\b/i, ['{o} came in hard and finished early. It happens to the best of them.', '{o} talked hard and went soft.']],
  [/\bcocks?\b|\bcockerels?\b/i, ['{o} were cocky at kick-off. Very quiet at full time.']],
  [/\bbangers?\b/i, ['{o} promised bangers and delivered a damp squib.']],
  [/\bbox\b/i, ["Nobody got into {o}'s box quite like we did."]],
  [/\blegends?\b/i, ['{o}: legends in their own minds.']],
  [/\bkings?\b/i, ['{o} were kings for about ninety seconds.', 'Long live the... no, actually, {o} were dethroned.']],
  [/\bwolves\b/i, ['{o} turned up as lapdogs.', '{o} howled at kick-off and whimpered by full time.'], ['{o} had teeth tonight, credit where due.']],
  [/\blions?\b/i, ['{o} roared at kick-off and purred by full time.']],
  [/\beagles?\b/i, ['{o} never got off the ground.', '{o} flew in and got grounded.']],
  [/\btitans?\b/i, ['{o}, titans by name, shrank by the hour.']],
  [/\belite\b/i, ['{o} call themselves elite. The scoreline begs to differ.']],
  [/\bsharks?\b/i, ['{o} smelled blood and found tomato sauce.', '{o}: all fin, no bite.']],
  [/\bbulls?\b/i, ['{o} charged at everything and hit nothing.', 'A lot of bull from {o}, very little football.']],
  [/\bpirates?\b/i, ['{o} came for treasure and walked the plank.']],
  [/\bvikings?\b/i, ['{o} came to raid and left with nothing but sea-sickness.']],
  [/\bspartans?\b/i, ['{o} were less 300, more 3-0-down.', 'This is Sparta? Not tonight it wasn\'t.']],
  [/\bdragons?\b/i, ['{o} breathed fire for ten minutes, then smoke.']],
  [/\bwarriors?\b/i, ['{o} brought the war paint and forgot the war.']],
  [/\bknights?\b/i, ['{o}: knights in rusty armour.', "It was a long night for {o}'s knights."]],
  [/\bboys\b|\blads\b/i, ['{o} were sent home to their mums early.', 'Men against {o}, tonight.']],
  [/\bgamers?\b|\besports?\b/i, ['{o} should check their controller batteries.', 'Game over for {o}. Insert coin to continue.']],
  [/\bacademy\b/i, ['{o} got a lesson, free of charge.', 'School was in session, and {o} failed the exam.']],
  [/\bhotspurs?\b/i, ['{o} were neither hot nor spurred.']],
  [/\bstars?\b/i, ['{o} saw stars, mostly ours.']],
  [/\bfury\b|\brage\b/i, ['{o} brought the fury; we brought the goals.']],
  [/\bsquad\b|\bcrew\b|\bgang\b/i, ['{o} rolled up mob-handed and left empty-handed.']],
];

function nameJoke(opponent, result, seed = '') {
  const o = String(opponent || '').trim();
  if (!o || o === 'Unknown') return null;
  const hit = NAME_JOKES.find(([re]) => re.test(o));
  if (!hit) return null;
  const [, good, bad] = hit;
  const lines = result === 'loss' ? bad : good;
  return lines?.length ? pickFrom(lines, seed || o, 'name').replace(/\{o\}/g, o) : null;
}

function verbFor(script, m, seed) {
  const pool = VERBS[script];
  const list = Array.isArray(pool) ? pool : pool ? pool[m.result] || pool.win : [`drew {s} with {o}`];
  return pickFrom(list, seed, 'verb').replace(/\{o\}/g, m.opponent).replace(/\{s\}/g, `${m.scoreFor}-${m.scoreAgainst}`);
}

function flavorFor(script, m, seed) {
  const list = FLAVOR[script] || FLAVOR[m.result];
  return list ? pickFrom(list, seed, 'flavor').replace(/\{o\}/g, m.opponent) : '';
}

module.exports = { pickFrom, statPun, nameJoke, verbFor, flavorFor, NAME_JOKES, STAT_PUNS };
