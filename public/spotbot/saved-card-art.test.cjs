const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('./graphics.cjs');
const fs = require('node:fs');

test('saved card fronts render across recap, squad and team of the week with fallback', () => {
  const savedCard = `data:image/png;base64,${Buffer.from(G.render('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="140"><rect width="100" height="140" fill="#ff00ff"/></svg>')).toString('base64')}`;
  const motm = { name: 'Example', position: 'ATT', rating: 8.7, goals: 2 };
  const outputs = {
    recap: G.recapGraphic({ clubName: 'Club', opponentName: 'Other', result: 'win', players: [motm], motm, savedCard }),
    squad: G.cardSheet({ title: 'Squad', cards: [{ name: 'Example', savedCard }] }),
    totw: G.totwPoster({ title: 'Week', players: [{ name: 'Example', line: 'FWD', rating: 8.7, savedCard }] }),
  };
  fs.mkdirSync('/tmp/saved-card-tests', { recursive: true });
  for (const [name, buffer] of Object.entries(outputs)) {
    assert.ok(buffer.length > 1000);
    fs.writeFileSync(`/tmp/saved-card-tests/${name}.png`, buffer);
  }
  assert.ok(G.recapGraphic({ clubName: 'Club', opponentName: 'Other', players: [motm], motm }).length > 1000);
});