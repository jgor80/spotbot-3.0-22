// One way to find the profile behind an EA gamertag. Keep in step with supabase/functions/_shared/ea-profiles.ts.
//
// Players who show up in EA match data before they link get an `ea_<gamertag>` placeholder profile.
// Older code spelled that ID several ways (lowercased, spaces/dots turned into _), so never find a
// placeholder by rebuilding its ID: match on ea_username instead (case-insensitive, literal).
// A gamertag can briefly sit on both a linked profile and a placeholder; the linked one always wins.

const isPlaceholderId = (id) => String(id ?? '').startsWith('ea_');

// The ID a new placeholder gets. Same spelling the EA sync has always used, so existing rows match.
const placeholderIdFor = (gamertag) => `ea_${String(gamertag).trim()}`;

// Escape LIKE/ILIKE wildcards so "Ace_10" can't match "AceX10"
const escapeLike = (value) => String(value).trim().replace(/[\\%_]/g, (c) => `\\${c}`);

// Every profile carrying this gamertag, linked accounts first
async function profilesForGamertag(db, gamertag) {
  const name = String(gamertag ?? '').trim();
  if (!name) return [];
  const { data, error } = await db.from('profiles').select('discord_user_id, ea_username').ilike('ea_username', escapeLike(name)).limit(20);
  // Logged, not thrown: one failed lookup shouldn't stop a whole sync
  if (error) { console.error(`[ea-profiles] Profile lookup for ${name} failed:`, error.message); return []; }
  const rows = data || [];
  return [...rows.filter((p) => !isPlaceholderId(p.discord_user_id)), ...rows.filter((p) => isPlaceholderId(p.discord_user_id))];
}

// The profile stats for this gamertag belong to: the linked account if there is one, else the placeholder
async function profileForGamertag(db, gamertag) {
  return (await profilesForGamertag(db, gamertag))[0] ?? null;
}

// The linked (real Discord) profile for this gamertag, or null
async function linkedProfileForGamertag(db, gamertag) {
  const p = await profileForGamertag(db, gamertag);
  return p && !isPlaceholderId(p.discord_user_id) ? p : null;
}

// IDs of every placeholder profile for this gamertag, whatever spelling made them
async function placeholderIdsForGamertag(db, gamertag) {
  return (await profilesForGamertag(db, gamertag)).map((p) => p.discord_user_id).filter(isPlaceholderId);
}

// Tables that hold rows for a profile, the column naming the player, and the columns that must stay
// unique per player (the player column plus these). A placeholder's row that would collide with one the
// real player already has is dropped instead of moved: the real row is kept and ratings are recalculated.
const PLAYER_TABLES = [
  { table: 'player_stats', idCol: 'discord_user_id', keys: ['guild_id', 'ea_match_id'] },
  { table: 'player_ratings', idCol: 'discord_user_id', keys: ['guild_id'] },
  { table: 'player_summary', idCol: 'discord_user_id', keys: ['guild_id'] },
  { table: 'player_club_stats', idCol: 'discord_user_id', keys: ['guild_id', 'club_key'] },
  { table: 'position_preferences', idCol: 'user_id', keys: ['guild_id'] },
];

// Move everything a placeholder profile holds to the real player in every server, then delete the
// placeholder. Leaves the placeholder in place if any move fails, so nothing is orphaned.
async function mergePlaceholderInto(db, tempId, realId) {
  if (!isPlaceholderId(tempId) || !realId || isPlaceholderId(realId)) return { ok: false, error: 'not a placeholder' };
  const errors = [];
  for (const { table, idCol, keys } of PLAYER_TABLES) {
    const cols = ['id', ...keys].join(', ');
    const last = keys[keys.length - 1];
    const keyOf = (r) => keys.map((k) => r[k] ?? '\u0000null').join('\u0001');
    // Pages of 200 until the placeholder holds nothing here, so the server's row cap never leaves rows behind
    for (let page = 0; page < 500; page++) {
      const { data: temp, error: tErr } = await db.from(table).select(cols).eq(idCol, tempId).limit(200);
      if (tErr) { errors.push(`${table}: ${tErr.message}`); break; }
      if (!temp?.length) break;
      // Only the real player's rows that could clash with this page
      const values = [...new Set(temp.map((r) => r[last]).filter((v) => v != null))];
      let real = [];
      if (values.length) {
        const { data, error: rErr } = await db.from(table).select(cols).eq(idCol, realId).in(last, values);
        if (rErr) { errors.push(`${table}: ${rErr.message}`); break; }
        real = data || [];
      }
      // A null key never collides (the unique index skips it)
      const taken = new Set(real.map(keyOf));
      const clashes = (r) => r[last] != null && taken.has(keyOf(r));
      const drop = temp.filter(clashes).map((r) => r.id);
      const move = temp.filter((r) => !clashes(r)).map((r) => r.id);
      if (drop.length) {
        const { error } = await db.from(table).delete().in('id', drop);
        if (error) { errors.push(`${table} delete: ${error.message}`); break; }
      }
      if (move.length) {
        const { error } = await db.from(table).update({ [idCol]: realId }).in('id', move);
        if (error) { errors.push(`${table} move: ${error.message}`); break; }
      }
    }
  }
  if (errors.length) {
    console.error(`[ea-profiles] Couldn't fully merge ${tempId} into ${realId}:`, errors.join('; '));
    return { ok: false, error: errors.join('; ') };
  }
  const { error } = await db.from('profiles').delete().eq('discord_user_id', tempId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Merge every placeholder carrying this gamertag into the real player; true if any were merged
async function mergePlaceholdersForGamertag(db, gamertag, realId) {
  let merged = false;
  for (const tempId of await placeholderIdsForGamertag(db, gamertag)) {
    if ((await mergePlaceholderInto(db, tempId, realId)).ok) merged = true;
  }
  return merged;
}

module.exports = { isPlaceholderId, placeholderIdFor, escapeLike, profilesForGamertag, profileForGamertag, linkedProfileForGamertag, placeholderIdsForGamertag, mergePlaceholderInto, mergePlaceholdersForGamertag, PLAYER_TABLES };
