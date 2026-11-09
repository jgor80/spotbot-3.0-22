// One team sheet per squad and channel at a time. Two leaders publishing the first lineup for the same
// event at once both found no earlier message, both posted, and players got competing team sheets. Every
// function runs inside the one bot process (local-functions.cjs), so an in-memory queue per key is enough:
// the second publish waits, then re-reads the lineup and finds the first one's message to edit.
const queues = new Map<string, Promise<unknown>>();

export function announceKey(
  lineup: { id: string; guild_id: string; team_id?: string | null; event_id?: string | null },
  channelId: string,
): string {
  // Same scope previousAnnouncement() searches: the event if there is one, else the squad, else the lineup
  const scope = lineup.event_id ? `event:${lineup.event_id}` : lineup.team_id ? `team:${lineup.team_id}` : `lineup:${lineup.id}`;
  return `${lineup.guild_id}:${channelId}:${scope}`;
}

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const before = queues.get(key) ?? Promise.resolve();
  const run = before.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  queues.set(key, tail);
  tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return run;
}
