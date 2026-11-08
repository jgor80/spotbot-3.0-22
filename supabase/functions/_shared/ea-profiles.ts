// One way to find the profile behind an EA gamertag. Keep in step with public/spotbot/ea-profiles.cjs.
//
// Players who show up in EA match data before they link get an `ea_<gamertag>` placeholder profile.
// Older code spelled that ID several ways (lowercased, spaces/dots turned into _), so never find a
// placeholder by rebuilding its ID: match on ea_username instead (case-insensitive, literal).
// A gamertag can briefly sit on both a linked profile and a placeholder; the linked one always wins.

// deno-lint-ignore no-explicit-any
type Db = any

export const isPlaceholderId = (id: unknown) => String(id ?? '').startsWith('ea_')

// The ID a new placeholder gets. Same spelling the EA sync has always used, so existing rows match.
export const placeholderIdFor = (gamertag: string) => `ea_${String(gamertag).trim()}`

// Escape LIKE/ILIKE wildcards so "Ace_10" can't match "AceX10"
export const escapeLike = (value: string) => String(value).trim().replace(/[\\%_]/g, (c) => `\\${c}`)

export interface GamertagProfile { discord_user_id: string; ea_username?: string | null }

// Every profile carrying this gamertag, linked accounts first
export async function profilesForGamertag(db: Db, gamertag: string): Promise<GamertagProfile[]> {
  const name = String(gamertag ?? '').trim()
  if (!name) return []
  const { data, error } = await db.from('profiles').select('discord_user_id, ea_username').ilike('ea_username', escapeLike(name)).limit(20)
  // Logged, not thrown: one failed lookup shouldn't stop a whole sync
  if (error) { console.error(`[ea-profiles] Profile lookup for ${name} failed:`, error.message); return [] }
  const rows = (data || []) as GamertagProfile[]
  return [...rows.filter((p) => !isPlaceholderId(p.discord_user_id)), ...rows.filter((p) => isPlaceholderId(p.discord_user_id))]
}

// The profile stats for this gamertag belong to: the linked account if there is one, else the placeholder
export async function profileForGamertag(db: Db, gamertag: string): Promise<GamertagProfile | null> {
  return (await profilesForGamertag(db, gamertag))[0] ?? null
}

// The linked (real Discord) profile for this gamertag, or null
export async function linkedProfileForGamertag(db: Db, gamertag: string): Promise<GamertagProfile | null> {
  const p = await profileForGamertag(db, gamertag)
  return p && !isPlaceholderId(p.discord_user_id) ? p : null
}

// IDs of every placeholder profile for this gamertag, whatever spelling made them
export async function placeholderIdsForGamertag(db: Db, gamertag: string): Promise<string[]> {
  return (await profilesForGamertag(db, gamertag)).map((p) => p.discord_user_id).filter(isPlaceholderId)
}

// Tables that hold rows for a profile, the column naming the player, and the columns that must stay
// unique per player (the player column plus these). A placeholder's row that would collide with one the
// real player already has is dropped instead of moved: the real row is kept and ratings are recalculated.
export const PLAYER_TABLES = [
  { table: 'player_stats', idCol: 'discord_user_id', keys: ['guild_id', 'ea_match_id'] },
  { table: 'player_ratings', idCol: 'discord_user_id', keys: ['guild_id'] },
  { table: 'player_summary', idCol: 'discord_user_id', keys: ['guild_id'] },
  { table: 'player_club_stats', idCol: 'discord_user_id', keys: ['guild_id', 'club_key'] },
  { table: 'position_preferences', idCol: 'user_id', keys: ['guild_id'] },
]

// Move everything a placeholder profile holds to the real player in every server, then delete the
// placeholder. Leaves the placeholder in place if any move fails, so nothing is orphaned.
export async function mergePlaceholderInto(db: Db, tempId: string, realId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isPlaceholderId(tempId) || !realId || isPlaceholderId(realId)) return { ok: false, error: 'not a placeholder' };
  const errors: string[] = [];
  for (const { table, idCol, keys } of PLAYER_TABLES) {
    const cols = ['id', ...keys].join(', ');
    const last = keys[keys.length - 1];
    // deno-lint-ignore no-explicit-any
    const keyOf = (r: any) => keys.map((k) => r[k] ?? '\u0000null').join('\u0001');
    // Pages of 200 until the placeholder holds nothing here, so the server's row cap never leaves rows behind
    for (let page = 0; page < 500; page++) {
      const { data: temp, error: tErr } = await db.from(table).select(cols).eq(idCol, tempId).limit(200);
      if (tErr) { errors.push(`${table}: ${tErr.message}`); break; }
      if (!temp?.length) break;
      // Only the real player's rows that could clash with this page
      // deno-lint-ignore no-explicit-any
      const values = [...new Set(temp.map((r: any) => r[last]).filter((v) => v != null))];
      // deno-lint-ignore no-explicit-any
      let real: any[] = [];
      if (values.length) {
        const { data, error: rErr } = await db.from(table).select(cols).eq(idCol, realId).in(last, values);
        if (rErr) { errors.push(`${table}: ${rErr.message}`); break; }
        real = data || [];
      }
      // A null key never collides (the unique index skips it)
      const taken = new Set(real.map(keyOf));
      // deno-lint-ignore no-explicit-any
      const clashes = (r: any) => r[last] != null && taken.has(keyOf(r));
      // deno-lint-ignore no-explicit-any
      const drop = temp.filter(clashes).map((r: any) => r.id);
      // deno-lint-ignore no-explicit-any
      const move = temp.filter((r: any) => !clashes(r)).map((r: any) => r.id);
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
export async function mergePlaceholdersForGamertag(db: Db, gamertag: string, realId: string): Promise<boolean> {
  let merged = false
  for (const tempId of await placeholderIdsForGamertag(db, gamertag)) {
    if ((await mergePlaceholderInto(db, tempId, realId)).ok) merged = true
  }
  return merged
}
