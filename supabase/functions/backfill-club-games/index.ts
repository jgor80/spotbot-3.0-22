// Silently backfill every game EA still has for one club (league, playoff/cup and friendly).
// Runs the normal sync for just that club, then moves the club's recap cursor and last_match_id
// past the new rows so the bot never posts recaps, result cards or rating DMs for them.
import { createAdminClient, identifyCaller, requireGuildAccess } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (!(await identifyCaller(req, createAdminClient()))) return json({ error: 'Unauthorized' }, 401)

  let body: any = {}
  try { body = await req.json() } catch { /* empty */ }
  const guildId = typeof body.guild_id === 'string' && /^\d{17,19}$/.test(body.guild_id) ? body.guild_id : null
  const clubKey = typeof body.club_key === 'string' && /^[\w-]{1,40}$/.test(body.club_key) ? body.club_key : null
  if (!guildId || !clubKey) return json({ error: 'guild_id and club_key are required' }, 400)
  const denied = await requireGuildAccess(req, createAdminClient(), guildId, 'leader')
  if (denied) return denied

  const supabase = createAdminClient()
  const { data: settings } = await supabase.from('guild_settings').select('clubs').eq('guild_id', guildId).maybeSingle()
  const club = (settings?.clubs as any[] | undefined)?.find((c) => c?.key === clubKey)
  if (!club) return json({ error: 'Club not found' }, 404)
  if (!club.ea_club_id) return json({ error: 'Club has no EA club linked' }, 400)

  const { count: before } = await supabase.from('club_matches').select('id', { count: 'exact', head: true })
    .eq('guild_id', guildId).eq('club_key', clubKey)

  // The scheduled sync already stores league, playoff and friendly games with full FC27 stats
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-ea-stats`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sync_type: 'full', guild_id: guildId, club_key: clubKey }),
  })
  const syncResult = await res.json().catch(() => ({}))

  const { count: after } = await supabase.from('club_matches').select('id', { count: 'exact', head: true })
    .eq('guild_id', guildId).eq('club_key', clubKey)
  const { data: newest } = await supabase.from('club_matches').select('ea_match_id, created_at')
    .eq('guild_id', guildId).eq('club_key', clubKey)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  // Re-read settings (the sync may have relinked the club) and silence everything just inserted
  const { data: fresh } = await supabase.from('guild_settings').select('clubs').eq('guild_id', guildId).maybeSingle()
  const clubs = (fresh?.clubs as any[]) || []
  const target = clubs.find((c) => c?.key === clubKey)
  if (target) {
    target.autopilot = { ...(target.autopilot || {}), recap_cursor: new Date().toISOString() }
    if (newest?.ea_match_id) target.last_match_id = newest.ea_match_id
    await supabase.from('guild_settings').update({ clubs }).eq('guild_id', guildId)
  }

  return json({
    success: res.ok,
    club: club.name,
    games_before: before ?? 0,
    games_after: after ?? 0,
    games_added: (after ?? 0) - (before ?? 0),
    sync: syncResult,
  }, res.ok ? 200 : 502)
})
