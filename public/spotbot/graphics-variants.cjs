const { randomInt, randomUUID } = require('node:crypto');
const LAST = new Map();
const LAYOUTS = ['lower-third', 'editorial', 'side-panel'];
const POSES = ['ready', 'stride', 'ball', 'celebrate', 'profile', 'captain'];

function choose(options, previous) {
  const pool = options.filter((v) => v !== previous);
  return pool[randomInt(pool.length)];
}

function nextVariation(key) {
  const previous = LAST.get(key) || {};
  const value = { composition: choose(LAYOUTS, previous.composition), pose: choose(POSES, previous.pose), variation: randomUUID() };
  LAST.delete(key);
  LAST.set(key, value);
  if (LAST.size > 2000) LAST.delete(LAST.keys().next().value);
  return value;
}

module.exports = { nextVariation, LAYOUTS, POSES };