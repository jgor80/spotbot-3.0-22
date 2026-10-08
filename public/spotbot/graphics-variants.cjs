const { randomInt, randomUUID } = require('node:crypto');
const LAST = new Map();
const LAYOUTS = ['lower-third', 'editorial', 'side-panel'];
const POSES = ['ready', 'stride', 'ball', 'celebrate', 'profile', 'captain'];

// Each style leans toward the shots that suit its vibe; every pose stays possible so cards never feel samey.
const STYLE_POSES = {
  modern: { stride: 3, ball: 3, ready: 2, celebrate: 2, profile: 1, captain: 1 },
  vintage: { profile: 4, captain: 3, ready: 3, ball: 2, stride: 1, celebrate: 1 },
  sicilia: { profile: 4, captain: 3, ready: 3, ball: 2, stride: 1, celebrate: 1 },
  cyber: { stride: 4, celebrate: 3, ready: 2, profile: 2, ball: 1, captain: 1 },
  chrome: { profile: 3, ready: 3, stride: 2, captain: 2, celebrate: 1, ball: 1 },
  mvp: { celebrate: 4, captain: 3, ball: 2, profile: 2, ready: 1, stride: 1 },
  sunday: { profile: 4, ready: 3, stride: 2, captain: 1, ball: 1, celebrate: 1 },
  synthwave: { ready: 3, profile: 3, celebrate: 2, stride: 2, ball: 1, captain: 1 },
  y2k: { stride: 3, celebrate: 3, ready: 2, ball: 2, profile: 1, captain: 1 },
  retro1960s: { profile: 4, captain: 3, ready: 3, ball: 2, stride: 1, celebrate: 1 },
  retro1970s: { profile: 3, captain: 3, ready: 3, ball: 2, stride: 2, celebrate: 1 },
  retro1986: { ready: 3, stride: 3, ball: 2, captain: 2, profile: 2, celebrate: 1 },
  retro1990s: { stride: 3, ball: 3, ready: 2, celebrate: 2, profile: 1, captain: 1 },
  retro2010s: { stride: 3, celebrate: 3, ready: 2, profile: 2, ball: 1, captain: 1 },
  retro2020s: { celebrate: 3, stride: 3, profile: 2, ready: 2, ball: 1, captain: 1 },
};
const MOOD_POSES = { win: { celebrate: 5, stride: 2, captain: 2 }, loss: { ready: 3, profile: 3, captain: 2 } };

function choose(options, avoid = []) {
  const pool = options.filter((v) => !avoid.includes(v));
  return (pool.length ? pool : options)[randomInt((pool.length ? pool : options).length)];
}

function weighted(weights, avoid) {
  const pool = POSES.filter((p) => !avoid.includes(p)).map((p) => [p, weights[p] ?? 1]);
  const total = pool.reduce((s, [, w]) => s + w, 0);
  let r = randomInt(total * 100) / 100;
  for (const [p, w] of pool) { if ((r -= w) < 0) return p; }
  return pool[pool.length - 1][0];
}

// Avoids the last two poses for this player/style and the last layout, weighted toward the style's vibe.
function nextVariation(key, style, mood) {
  const previous = LAST.get(key) || {};
  const recent = previous.recentPoses || [];
  const weights = { ...(STYLE_POSES[style] || {}), ...(MOOD_POSES[mood] || {}) };
  const pose = weighted(weights, recent);
  const value = { composition: choose(LAYOUTS, [previous.composition]), pose, variation: randomUUID() };
  LAST.delete(key);
  LAST.set(key, { ...value, recentPoses: [pose, ...recent].slice(0, 2) });
  if (LAST.size > 2000) LAST.delete(LAST.keys().next().value);
  return value;
}

module.exports = { nextVariation, LAYOUTS, POSES, STYLE_POSES };
