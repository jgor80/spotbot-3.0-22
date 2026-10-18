// Automatic lineups for AI apps (gafferbot-mcp/lineups.ts): pick an event's XI from who answered
// Available (then Maybe) and their position tiers, with the same picker as Autopilot's suggested XI
// and the web Lineup Builder (pickLineup in src/lib/lineupAutofill.ts). Suggesting changes nothing;
// publishing is for the club's leaders and posts the team sheet in the event's channel.

const MAX_POOL = 30;
const SNOWFLAKE = /^\d{17,20}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class LineupError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const FIT_LABEL = { primary: 'comp position', secondary: 'plays well', emergency: 'emergency cover', none: 'out of position', unknown: 'no positions saved' };

// Move players onto chosen spots; whoever they displace goes to the bench. `changes` is
// [{ slot, player_id }] with slot the index in the formation (as the suggestion lists it).
function applyChanges(plan, changes) {
  if (!changes?.length) return plan;
  const rows = plan.rows.map((r) => ({ ...r }));
  const starters = new Map(rows.filter((r) => !r.is_substitute).map((r) => [r.slot_index, r.discord_user_id]));
  const bench = rows.filter((r) => r.is_substitute).map((r) => r.discord_user_id);
  for (const c of changes) {
    const slot = Number(c.slot);
    const id = String(c.player_id || '');
    if (!Number.isInteger(slot) || slot < 0 || slot >= plan.slots.length) throw new LineupError(400, `slot ${c.slot} isn't a spot in ${plan.formation} (0-${plan.slots.length - 1}).`);
    if (!SNOWFLAKE.test(id)) throw new LineupError(400, 'player_id must be a Discord user ID from the suggestion.');
    for (const [s, p] of starters) if (p === id) starters.delete(s);
    const b = bench.indexOf(id);
    if (b >= 0) bench.splice(b, 1);
    const displaced = starters.get(slot);
    if (displaced && displaced !== id) bench.unshift(displaced);
    starters.set(slot, id);
  }
  return {
    ...plan,
    rows: [
      ...[...starters.entries()].sort((a, b) => a[0] - b[0]).map(([slot, id]) => ({ slot_index: slot, position: plan.slots[slot], discord_user_id: id, is_substitute: false })),
      ...bench.slice(0, 9).map((id, i) => ({ slot_index: plan.slots.length + i, position: plan.tiers?.get(id)?.primary || 'SUB', discord_user_id: id, is_substitute: true })),
    ],
  };
}

function createLineupAi({ getClient, events, autopilot, canManageClub, callEdgeFunction, supabase }) {
  async function context({ guildId, userId, eventId }) {
    if (!UUID.test(String(eventId || ''))) throw new LineupError(400, 'event_id must be an event ID from list_events.');
    const event = await events.loadEvent(eventId);
    if (!event || event.guild_id !== guildId) throw new LineupError(404, 'Event not found.');
    if (event.cancelled) throw new LineupError(400, 'That event was cancelled.');
    const guild = getClient()?.guilds?.cache.get(guildId);
    if (!guild) throw new LineupError(404, 'GafferBot is not in that server (or is still starting up).');
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) throw new LineupError(403, "Your Discord account isn't a member of that server.");
    const club = event.club_key ? await events.clubFor(guildId, event.club_key) : null;
    if (!club) throw new LineupError(400, "That event isn't linked to a club, so there's no squad to pick from.");
    return { event, guild, member, club };
  }

  // Available first, then Maybe
  async function poolFor(event) {
    const responses = await events.loadResponses(event.id);
    const ids = (r) => responses.filter((x) => x.response === r).map((x) => x.discord_user_id);
    return { pool: [...ids('yes'), ...ids('maybe')].slice(0, MAX_POOL), out: ids('no') };
  }

  const nameOf = (guild, id) => {
    const m = guild.members.cache.get(id);
    return m?.displayName || m?.user?.username || id;
  };

  function describe(plan, guild, out) {
    const xi = plan.rows.filter((r) => !r.is_substitute);
    const filled = new Set(xi.map((r) => r.slot_index));
    const fitCounts = {};
    for (const r of xi) {
      const f = plan.fits?.get(r.discord_user_id) || 'unknown';
      fitCounts[FIT_LABEL[f]] = (fitCounts[FIT_LABEL[f]] || 0) + 1;
    }
    return {
      formation: plan.formation,
      formation_record: plan.stat?.record ? { games: plan.stat.record.games, wins: plan.stat.record.wins, draws: plan.stat.record.draws, losses: plan.stat.record.losses } : undefined,
      starting_xi: xi.map((r) => ({
        slot: r.slot_index,
        position: r.position,
        player: nameOf(guild, r.discord_user_id),
        player_id: r.discord_user_id,
        answer: plan.answers?.get(r.discord_user_id) === 'maybe' ? 'maybe' : 'available',
        fit: FIT_LABEL[plan.fits?.get(r.discord_user_id) || 'unknown'],
      })),
      open_spots: plan.slots.map((position, slot) => ({ slot, position })).filter((s) => !filled.has(s.slot)),
      bench: plan.rows.filter((r) => r.is_substitute).map((r) => ({
        player: nameOf(guild, r.discord_user_id),
        player_id: r.discord_user_id,
        answer: plan.answers?.get(r.discord_user_id) === 'maybe' ? 'maybe' : 'available',
        usual_position: r.position === 'SUB' ? undefined : r.position,
      })),
      fit_summary: fitCounts,
      best_pairings_starting: (plan.pairs || []).map((p) => p.ids.map((id) => nameOf(guild, id)).join(' + ')),
      not_available: out.map((id) => nameOf(guild, id)),
    };
  }

  async function build(args) {
    const ctx = await context(args);
    const { pool, out } = await poolFor(ctx.event);
    // Names come from the member cache; load anyone who answered but isn't cached yet
    const uncached = [...pool, ...out].filter((id) => !ctx.guild.members.cache.has(id));
    await Promise.all(uncached.slice(0, MAX_POOL).map((id) => ctx.guild.members.fetch(id).catch(() => null)));
    if (!pool.length) throw new LineupError(400, "Nobody has answered Available or Maybe for that event yet, so there's no one to pick.");
    const formation = args.formation ? String(args.formation).toUpperCase() : undefined;
    let plan = await autopilot.draft(ctx.event, ctx.club, pool, formation && autopilot.formations().includes(formation) ? formation : undefined);
    if (formation && plan.formation !== formation) throw new LineupError(400, `Unknown formation "${args.formation}". Use one of: ${autopilot.formations().join(', ')}.`);
    plan = applyChanges(plan, args.changes);
    return { ...ctx, plan, out };
  }

  async function handle(op, args) {
    if (op === 'formations') return { formations: autopilot.formations() };
    if (op === 'suggest') {
      const { event, guild, club, plan, out } = await build(args);
      return { event: { id: event.id, title: event.title, scheduled_at: event.scheduled_at, club: club.name }, ...describe(plan, guild, out) };
    }
    if (op === 'publish') {
      const { event, guild, member, club, plan, out } = await build(args);
      if (!(await canManageClub(member, club))) throw new LineupError(403, `Only ${club.name}'s leaders can publish a lineup.`);
      const { data: existing } = await supabase.from('lineups').select('id').eq('event_id', event.id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
      const summary = describe(plan, guild, out);
      if (!args.confirm) {
        return { ...summary, replaces_existing_team_sheet: !!existing, channel_id: event.channel_id };
      }
      const lineupId = await autopilot.saveDraft(event, club, plan, existing?.id);
      const { error, data } = await callEdgeFunction(
        'announce-lineup',
        { action: 'announce', lineup_id: lineupId, channel_id: event.channel_id, mention_players: true, dm_players: false, message: '' },
        30000
      );
      if (error || !data?.success) throw new LineupError(502, `Saved the lineup but couldn't post it: ${error || data?.error || 'unknown error'}`);
      return { published: true, lineup_id: lineupId, channel_id: event.channel_id, replaced_existing_team_sheet: !!existing, ...summary };
    }
    throw new LineupError(400, `Unknown lineup operation ${op}.`);
  }

  return { handle };
}

module.exports = { createLineupAi, applyChanges, LineupError };
