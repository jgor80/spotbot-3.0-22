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
