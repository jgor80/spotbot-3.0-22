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

module.exports = { isPlaceholderId, placeholderIdFor, escapeLike, profilesForGamertag, profileForGamertag, linkedProfileForGamertag, placeholderIdsForGamertag };
