import { assertEquals } from 'jsr:@std/assert@1'
import { createRequire } from 'node:module'
import { EA_EVENT_STATS, eaEventCounts, eaEventStats } from './ea-events.ts'

const require = createRequire(import.meta.url)
const bot = require('../../../public/spotbot/ea-events.cjs')

// Sample from the research README's /clubs/matches player row
const row = {
  match_event_aggregate_0: '0:2,109:3,112:3,121:2,145:5,157:3,164:2,174:19,215:21,216:5,217:1,24:17,25:5,26:1,30:8,31:3,32:3,34:10,35:2,36:3,6:1',
  match_event_aggregate_1: '97:10',
  match_event_aggregate_2: '',
  match_event_aggregate_3: '',
}

Deno.test('bot copy of the event map matches the backend one', () => {
  assertEquals(bot.EA_EVENT_STATS, EA_EVENT_STATS)
  assertEquals(bot.eaEventStats(row), eaEventStats(row))
})

Deno.test('decodes a real FC27 player row with the research codes', () => {
  const s = eaEventStats(row)
  assertEquals(s.passesCompleted, 21)
  assertEquals(s.dribbles, 19)
  assertEquals(s.progressiveCarries, 10)
  assertEquals(s.interceptions, 1)
  assertEquals(s.tacklesWon, 2)
  assertEquals(s.possessionGains, 3)
  assertEquals(s.shotsOnTarget, 1)
  assertEquals(s.forwardPasses, 8)
  assertEquals(s.throughBalls, 0)
})

Deno.test('sums repeated codes and ignores junk', () => {
  assertEquals(eaEventCounts({ match_event_aggregate_0: '6:1,x:2,6:2', match_event_aggregate_1: '6:3,7:' }), { 6: 6 })
  assertEquals(eaEventStats(null).interceptions, 0)
})
