// The newspaper's memory: every edition, session edition, match report and Network Wire the bot prints is
// saved to club_press with its headline, lead story and the stock lines it used. The next edition reads
// the last ten days back so it leads with something new, follows up running storylines and picks phrases
// it hasn't printed lately. The website's Newspaper page and the "In the papers" list on player profiles
// read the same rows.

const MEMORY_DAYS = 10;

// What the paper remembers, from club_press rows (newest first)
function memoryFrom(rows = []) {
  const storyAt = new Map();
  for (const r of rows) for (const k of r.story_keys || []) if (!storyAt.has(k)) storyAt.set(k, new Date(r.printed_at));
  return {
    headlines: rows.map((r) => r.headline).filter(Boolean).slice(0, 8),
    leads: new Set(rows.map((r) => r.lead_key).filter(Boolean)),
    stories: new Set(storyAt.keys()),
    storyAt,
    phrases: new Set(rows.flatMap((r) => r.phrase_keys || [])),
    lastPrinted: rows[0] ? new Date(rows[0].printed_at) : null,
  };
}

const EMPTY_MEMORY = memoryFrom([]);

function embedJson(message) {
  const e = message?.embeds?.[0];
  if (!e) return {};
  const json = typeof e.toJSON === 'function' ? e.toJSON() : e;
  // Attachment images only exist on the Discord message; the website shows text
  const { image, ...rest } = json;
  return rest;
}

function createPressLog(supabase) {
  async function recent(guildId, clubKey, { days = MEMORY_DAYS, kinds = null } = {}) {
    try {
      let q = supabase
        .from('club_press')
        .select('kind, printed_at, headline, lead_key, story_keys, phrase_keys')
        .eq('guild_id', guildId)
        .eq('club_key', clubKey)
        .gte('printed_at', new Date(Date.now() - days * 86400000).toISOString());
      if (kinds && q.in) q = q.in('kind', kinds);
      const { data } = await q.order('printed_at', { ascending: false }).limit(40);
      return memoryFrom(data || []);
    } catch {
      return EMPTY_MEMORY;
    }
  }

  // message: what was sent to Discord; press: { headline, lead_key, story_keys, phrase_keys, player_keys, match_id }
  async function save(guildId, clubKey, kind, message, press = {}) {
    try {
      const body = embedJson(message);
      const { error } = await supabase.from('club_press').insert({
        guild_id: guildId,
        club_key: clubKey,
        kind,
        headline: press.headline || body.title || null,
        lead_key: press.lead_key || null,
        story_keys: [...new Set(press.story_keys || [])].slice(0, 60),
        phrase_keys: [...new Set(press.phrase_keys || [])].slice(0, 60),
        player_keys: [...new Set((press.player_keys || []).map((k) => String(k).toLowerCase()))].slice(0, 40),
        match_id: press.match_id || null,
        body,
      });
      if (error) console.warn(`[press] save failed: ${error.message}`);
    } catch (err) {
      console.warn(`[press] save failed: ${err.message}`);
    }
  }

  return { recent, save };
}

// Split a built message into what Discord gets and what the press log keeps
function splitPress(msg) {
  if (!msg) return { message: null, press: null };
  const { press, ...message } = msg;
  return { message, press: press || {} };
}

module.exports = { createPressLog, memoryFrom, splitPress, EMPTY_MEMORY, MEMORY_DAYS };
