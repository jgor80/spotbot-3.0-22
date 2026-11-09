import { test } from "node:test";
import assert from "node:assert/strict";
import { announceKey, withLock } from "./lock.ts";

const lineup = (o: Record<string, string | null>) => ({ id: "L1", guild_id: "G", team_id: null, event_id: null, ...o });

test("two lineups for the same event and channel share a key", () => {
  assert.equal(announceKey(lineup({ id: "L1", event_id: "E" }), "C"), announceKey(lineup({ id: "L2", event_id: "E", team_id: "T" }), "C"));
  assert.notEqual(announceKey(lineup({ event_id: "E" }), "C"), announceKey(lineup({ event_id: "E" }), "C2"));
  assert.equal(announceKey(lineup({ team_id: "T" }), "C"), "G:C:team:T");
  assert.equal(announceKey(lineup({}), "C"), "G:C:lineup:L1");
});

test("publishes with the same key run one after another; a failure doesn't block the next", async () => {
  const order: string[] = [];
  let posted: string | null = null;
  // Each publish looks for an earlier message, waits (the Discord call), then posts if there was none
  const publish = (who: string) => withLock("k", async () => {
    const existing = posted;
    await new Promise((r) => setTimeout(r, 10));
    if (!existing) posted = who;
    order.push(`${who}:${existing ? "edit" : "post"}`);
  });
  const failing = withLock("k", async () => { throw new Error("discord down"); });
  await Promise.all([publish("a"), failing.catch(() => {}), publish("b")]);
  assert.deepEqual(order, ["a:post", "b:edit"]);
});

test("different keys don't wait for each other", async () => {
  let other = false;
  const slow = withLock("x", () => new Promise((r) => setTimeout(r, 30)));
  await withLock("y", async () => { other = true; });
  assert.equal(other, true);
  await slow;
});
