const { randomInt, randomUUID } = require('node:crypto');
const LAST = new Map();
const LAYOUTS = ['lower-third', 'editorial', 'side-panel'];
const POSES = ['ready', 'stride', 'ball', 'celebrate', 'profile', 'captain', 'arms_crossed', 'chest_tap', 'knee_slide', 'walkout', 'shush', 'strike', 'header', 'sky_point', 'keepy_uppy', 'hands_on_head'];
// Same keys as supabase/functions/club-art/variety.ts, which holds the prompt line for each.
const CAMERAS = ['low_hero', 'eye_level', 'high_three_quarter', 'dutch_tilt', 'telephoto', 'wide_close', 'side_on', 'tracking', 'symmetrical', 'broadcast'];
const LIGHTING = ['floodlit_rim', 'golden_hour', 'overcast', 'spotlight', 'neon_accents', 'rain_floodlights', 'broadcast_key', 'backlight_flare', 'storm', 'haze'];
const SCENES = ['packed_stands', 'tunnel', 'touchline', 'empty_stadium', 'ultras', 'training_ground', 'goalmouth', 'confetti', 'centre_circle', 'city_rooftop'];
const ARRANGEMENTS = ['staggered', 'v_formation', 'arms_linked', 'walking_out', 'steps', 'huddle_turn', 'celebration_pile', 'back_to_back'];
// How many recent picks each player/style skips, so a run of cards keeps changing
const RECENT = { poses: 4, cameras: 3, lighting: 3, scenes: 3, arrangements: 2 };

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
const MOOD_POSES = {
  win: { celebrate: 5, knee_slide: 3, sky_point: 3, shush: 2, chest_tap: 2, stride: 2, captain: 2 },
  loss: { ready: 3, profile: 3, captain: 2, arms_crossed: 3, walkout: 2, hands_on_head: 2, celebrate: 0, knee_slide: 0, sky_point: 0, shush: 0 },
};
// Nothing celebratory after a defeat
const MOOD_AVOID = { loss: ['confetti', 'celebration_pile'] };

function choose(options, avoid = []) {
  const pool = options.filter((v) => !avoid.includes(v));
  return (pool.length ? pool : options)[randomInt((pool.length ? pool : options).length)];
}

function weighted(weights, avoid) {
  let pool = POSES.filter((p) => !avoid.includes(p)).map((p) => [p, weights[p] ?? 1]).filter(([, w]) => w > 0);
  if (!pool.length) pool = POSES.map((p) => [p, weights[p] ?? 1]).filter(([, w]) => w > 0);
  const total = pool.reduce((s, [, w]) => s + w, 0);
  let r = randomInt(total * 100) / 100;
  for (const [p, w] of pool) { if ((r -= w) < 0) return p; }
  return pool[pool.length - 1][0];
}

// A fresh shot every render: pose (weighted toward the style's vibe), camera, lighting, scene and group
// arrangement are each picked apart, skipping this player/style's recent picks and the last layout.
function nextVariation(key, style, mood) {
  const previous = LAST.get(key) || {};
  const recent = previous.recent || {};
  const avoid = (kind) => [...(recent[kind] || []), ...(MOOD_AVOID[mood] || [])];
  const weights = { ...(STYLE_POSES[style] || {}), ...(MOOD_POSES[mood] || {}) };
  const value = {
    composition: choose(LAYOUTS, [previous.composition]),
    pose: weighted(weights, recent.poses || []),
    camera: choose(CAMERAS, avoid('cameras')),
    lighting: choose(LIGHTING, avoid('lighting')),
    scene: choose(SCENES, avoid('scenes')),
    arrangement: choose(ARRANGEMENTS, avoid('arrangements')),
    variation: randomUUID(),
  };
  const remember = (kind, v) => [v, ...(recent[kind] || [])].slice(0, RECENT[kind]);
  LAST.delete(key);
  LAST.set(key, { composition: value.composition, recent: { poses: remember('poses', value.pose), cameras: remember('cameras', value.camera),
    lighting: remember('lighting', value.lighting), scenes: remember('scenes', value.scene), arrangements: remember('arrangements', value.arrangement) } });
  if (LAST.size > 2000) LAST.delete(LAST.keys().next().value);
  return value;
}

module.exports = { nextVariation, LAYOUTS, POSES, STYLE_POSES, CAMERAS, LIGHTING, SCENES, ARRANGEMENTS };
