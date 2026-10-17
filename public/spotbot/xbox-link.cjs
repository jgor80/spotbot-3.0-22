// Fills profiles.xbox_xuid for Xbox players so presence polling can see them.
// Only players who said they're on Xbox are looked up: a gamertag from their Discord-verified
// Xbox connection, or their EA name when their saved platform is Xbox. Exact gamertag matches
// only, so a PlayStation player is never tied to a stranger's Xbox account with the same name.
const XBOX_PLATFORMS = ['xbox-series-xs', 'xboxone', 'xbox'];
const RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH = 10;

const norm = (s) => String(s || '').trim().toLowerCase();

// The gamertag to look up for a profile, or null when we can't tell they're on Xbox
function gamertagFor(p) {
  if (p?.xbox_gamertag) return String(p.xbox_gamertag).trim();
  if (p?.ea_username && XBOX_PLATFORMS.includes(norm(p.ea_platform))) return String(p.ea_username).trim();
  return null;
}

// Exact (case-insensitive) match from an OpenXBL search result
function pickExact(people, gamertag) {
  return (people || []).find((p) => p?.xuid && norm(p.gamertag) === norm(gamertag)) || null;
}

function createXboxLink({ supabase, apiKey = process.env.OPENXBL_API_KEY, fetchFn = globalThis.fetch }) {
  async function search(gamertag) {
    const res = await fetchFn(`https://xbl.io/api/v2/search/${encodeURIComponent(gamertag)}`, {
      headers: { 'X-Authorization': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 429) { const e = new Error('rate limited'); e.rateLimited = true; throw e; }
    if (!res.ok) throw new Error(`OpenXBL ${res.status}`);
    return pickExact((await res.json())?.people, gamertag);
  }

  // Look up one profile and save what we find. Returns 'linked', 'not_found' or 'skipped'.
  async function resolveProfile(profile) {
    const gamertag = gamertagFor(profile);
    if (!apiKey || !gamertag) return 'skipped';
    const match = await search(gamertag);
    const fields = { xbox_lookup_at: new Date().toISOString() };
    if (match) Object.assign(fields, { xbox_xuid: String(match.xuid), xbox_gamertag: match.gamertag || gamertag });
    await supabase.from('profiles').update(fields).eq('discord_user_id', profile.discord_user_id);
    return match ? 'linked' : 'not_found';
  }

  // Resolve one Discord user right away (after they link EA or sign in on the web)
  async function resolveUser(discordUserId) {
    const { data } = await supabase.from('profiles')
      .select('discord_user_id, ea_username, ea_platform, xbox_gamertag, xbox_xuid')
      .eq('discord_user_id', discordUserId).maybeSingle();
    if (!data || data.xbox_xuid) return 'skipped';
    return resolveProfile(data).catch(() => 'skipped');
  }

  // A small batch per run keeps us well inside OpenXBL's hourly limit
  async function backfill({ limit = BATCH } = {}) {
    const out = { linked: 0, not_found: 0, skipped: 0 };
    if (!apiKey) return out;
    const retryBefore = Date.now() - RETRY_AFTER_MS;
    const { data, error } = await supabase.from('profiles')
      .select('discord_user_id, ea_username, ea_platform, xbox_gamertag, xbox_xuid, xbox_lookup_at')
      .is('xbox_xuid', null)
      .or(`xbox_gamertag.not.is.null,ea_platform.in.(${XBOX_PLATFORMS.join(',')})`)
      .limit(500);
    if (error) { console.error('[xbox-link] backfill query failed:', error.message); return out; }
    const due = (data || []).filter((p) => !String(p.discord_user_id).startsWith('ea_') && gamertagFor(p)
      && (!p.xbox_lookup_at || Date.parse(p.xbox_lookup_at) < retryBefore)).slice(0, limit);
    for (const p of due) {
      try {
        out[await resolveProfile(p)] += 1;
      } catch (e) {
        if (e.rateLimited) break;
        out.skipped += 1;
      }
    }
    if (out.linked || out.not_found) console.log(`[xbox-link] linked ${out.linked}, not found ${out.not_found}`);
    return out;
  }

  return { resolveProfile, resolveUser, backfill };
}

module.exports = { createXboxLink, gamertagFor, pickExact, XBOX_PLATFORMS };
