// Lineup board: the lineup11-style pitch image (player cards on a striped pitch, bench strip
// underneath) and the Discord editor behind Team Sheet → Edit Lineup. Discord has no drag and
// drop, so a move is two picks: the player, then where they go (a spot, the bench, or out). The
// moves themselves are the web editor's (movePlayer in src/lib/lineupBoard.ts), so a swap behaves
// the same in both places. Save & Post saves a new lineup for the squad and posts it through
// announce-lineup with this image, which edits the squad's earlier team sheet and pings the XI.

const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const G = require('./graphics.cjs');
const PT = require('./position-tiers.cjs');
const { kitColor } = require('./studio-preview.cjs');
const { kitOf, crestUrl } = require('./club-colors.cjs');
const { FORMATION_SLOTS, FORMATION_COORDS, movePlayer, resizeBoard, boardToSlots, slotsToBoard, groupByPosition, MAX_BENCH } = require('./lineup-autofill.cjs');

const DEFAULT_FORMATION = '4-3-3 FLAT';
const DRAFT_TTL_MS = 30 * 60 * 1000;
const CARD_TTL_MS = 10 * 60 * 1000;
const HISTORY = 20;
const ANSWER = { yes: '✅', maybe: '❓', no: '❌' };
// How well the held player fits a spot: comp position, plays it well, emergency cover, or not theirs
const FIT_EMOJI = { primary: '⭐', secondary: '👍', emergency: '🆘', none: '▫️' };
const FIT_TEXT = { primary: 'Their comp position', secondary: 'Plays it well', emergency: 'Emergency cover', none: undefined };
// A LWB, RWB or CF spot counts as the nearest position players pick (LB, RB, ST)
function fitFor(player, pos) {
  if (player?.tiers) return PT.tierOf(player.tiers, pos) || 'none';
  const at = (player?.positions || []).map((p) => PT.cleanPos(p) || p).indexOf(PT.cleanPos(pos) || pos);
  return at === 0 ? 'primary' : at > 0 ? 'secondary' : 'none';
}

const esc = G.esc;
const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s || ''));
const fit = (text, w, max, min = 14) => Math.max(min, Math.min(max, Math.floor(w / (Math.max(String(text || '').length, 1) * 0.52))));
const initials = (name) => {
  const words = String(name || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
};

// Pitch looks, matching the web editor's Image tab
const PITCHES = {
  classic: { a: '#4f9a45', b: '#5aa64f', line: 'rgba(255,255,255,0.75)', bg: '#0f2a1a', ink: '#ffffff' },
  night: { a: '#1f4d36', b: '#245a3f', line: 'rgba(209,250,229,0.55)', bg: '#06130c', ink: '#e6fff3' },
  chalkboard: { a: '#2b3a33', b: '#2f4038', line: 'rgba(255,255,255,0.8)', bg: '#141c18', ink: '#ffffff' },
};

function jersey(cx, top, w, main, trim, label) {
  const s = w / 100;
  const x = (v) => (cx + (v - 50) * s).toFixed(1);
  const y = (v) => (top + v * s).toFixed(1);
  const body = `M${x(30)} ${y(4)} L${x(12)} ${y(12)} L${x(0)} ${y(34)} L${x(14)} ${y(44)} L${x(22)} ${y(36)} L${x(22)} ${y(100)} L${x(78)} ${y(100)} L${x(78)} ${y(36)} L${x(86)} ${y(44)} L${x(100)} ${y(34)} L${x(88)} ${y(12)} L${x(70)} ${y(4)} Q${x(50)} ${y(18)} ${x(30)} ${y(4)} Z`;
  return `<path d="${body}" fill="${main}" stroke="rgba(0,0,0,0.45)" stroke-width="${(2.5 * s).toFixed(1)}"/>
    <path d="M${x(30)} ${y(4)} Q${x(50)} ${y(18)} ${x(70)} ${y(4)}" fill="none" stroke="${trim}" stroke-width="${(5 * s).toFixed(1)}"/>
    <text x="${cx}" y="${y(70)}" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${(34 * s).toFixed(0)}" fill="${trim}">${esc(label)}</text>`;
}

// d: { title, subtitle, formation, kit: {primary, secondary, accent?, accent2?}, crest, pitch, footer,
//      starters: [{ position, name, rating, card }] in slot order (null = open spot),
//      bench: [{ name, card }] }
// card is a data URL of the player's latest saved player card; without one they get a kit jersey.
function boardSvg(d) {
  const W = 1080;
  const P = PITCHES[d.pitch] || PITCHES.classic;
  const main = kitColor(d.kit?.primary, '#b91c1c');
  const trim = kitColor(d.kit?.secondary, main === '#ffffff' ? '#111111' : '#ffffff');
  // Header stripes in the team colours (kit colours when the club picked none)
  const band = kitColor(d.kit?.accent, main);
  const band2 = kitColor(d.kit?.accent2, trim);
  const titleW = d.crest ? 820 : 960;
  const benchList = (d.bench || []).slice(0, MAX_BENCH);
  const top = 150;
  const pitchH = 1250;
  const benchH = benchList.length ? 250 : 0;
  const H = top + pitchH + benchH + 70;
  const px = 50;
  const pw = W - 100;
  const coords = FORMATION_COORDS[d.formation] || FORMATION_COORDS[DEFAULT_FORMATION];

  const stripes = Array.from({ length: 12 }, (_, i) => `<rect x="${px}" y="${top + (i * pitchH) / 12}" width="${pw}" height="${pitchH / 12}" fill="${i % 2 ? P.a : P.b}"/>`).join('');
  const L = `stroke="${P.line}" stroke-width="4" fill="none"`;
  const markings = `
    <rect x="${px + 20}" y="${top + 20}" width="${pw - 40}" height="${pitchH - 40}" ${L}/>
    <line x1="${px + 20}" y1="${top + pitchH / 2}" x2="${px + pw - 20}" y2="${top + pitchH / 2}" stroke="${P.line}" stroke-width="4"/>
    <circle cx="${W / 2}" cy="${top + pitchH / 2}" r="95" ${L}/>
    <circle cx="${W / 2}" cy="${top + pitchH / 2}" r="7" fill="${P.line}"/>
    <rect x="${W / 2 - 220}" y="${top + 20}" width="440" height="170" ${L}/>
    <rect x="${W / 2 - 100}" y="${top + 20}" width="200" height="65" ${L}/>
    <rect x="${W / 2 - 220}" y="${top + pitchH - 190}" width="440" height="170" ${L}/>
    <rect x="${W / 2 - 100}" y="${top + pitchH - 85}" width="200" height="65" ${L}/>`;

  const marker = (cx, cy, p, size) => {
    const name = p.name || 'Player';
    const w = size;
    const h = Math.round(size * 1.4);
    // Without a saved card the player gets a kit jersey (keeper in yellow) the same width, so the
    // name tag sits right under whichever is drawn
    const jw = w * 1.05;
    const faceTop = p.card ? cy - h / 2 : cy - jw / 2;
    const faceBottom = p.card ? cy + h / 2 : cy + jw / 2;
    const face = p.card
      ? `<image href="${p.card}" x="${cx - w / 2}" y="${faceTop}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`
      : jersey(cx, faceTop, jw, p.position === 'GK' ? '#facc15' : main, p.position === 'GK' ? '#111111' : trim, p.rating ? Math.round(p.rating) : initials(name));
    const tag = clip(name.toUpperCase(), 16);
    const tw = Math.max(90, Math.min(220, tag.length * 15 + 28));
    return `${face}
      <rect x="${cx - tw / 2}" y="${faceBottom + 4}" width="${tw}" height="36" rx="6" fill="#0b0f0c" stroke="rgba(255,255,255,0.85)" stroke-width="2"/>
      <text x="${cx}" y="${faceBottom + 31}" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="${fit(tag, tw - 16, 24)}" fill="#ffffff">${esc(tag)}</text>
      ${p.position && p.position !== 'SUB' ? `<rect x="${cx - w / 2 - 10}" y="${faceTop - 8}" width="54" height="28" rx="6" fill="${main}" stroke="${trim}" stroke-width="2"/><text x="${cx - w / 2 + 17}" y="${faceTop + 13}" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="18" fill="${trim}">${esc(p.position)}</text>` : ''}`;
  };

  const starters = coords.map((c, i) => {
    const p = d.starters?.[i];
    const cx = px + 70 + ((pw - 140) * c.x) / 100;
    // Formations use y 10 (attack) to 90 (keeper); spread that over the pitch so lines don't touch
    const cy = top + 110 + ((pitchH - 250) * (Math.min(Math.max(c.y, 10), 90) - 10)) / 80;
    if (!p) {
      return `<circle cx="${cx}" cy="${cy}" r="44" fill="rgba(255,255,255,0.12)" stroke="${P.line}" stroke-width="3" stroke-dasharray="8 6"/>
        <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="28" fill="${P.ink}">${esc(c.position)}</text>`;
    }
    return marker(cx, cy, { ...p, position: c.position }, 104);
  }).join('');

  const benchY = top + pitchH + 30;
  const bench = benchList.length
    ? `<rect x="${px}" y="${benchY}" width="${pw}" height="${benchH - 20}" rx="18" fill="rgba(0,0,0,0.35)"/>
       <text x="${px + 24}" y="${benchY + 38}" font-family="Oswald" font-weight="700" font-size="26" letter-spacing="3" fill="${P.ink}">BENCH</text>
       ${benchList.map((p, k) => {
         const slotW = (pw - 40) / Math.max(benchList.length, 5);
         return marker(px + 20 + slotW * (k + 0.5), benchY + 112, { ...p, position: 'SUB' }, Math.min(84, slotW - 16));
       }).join('')}`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${P.bg}"/>
    <rect width="${W}" height="10" fill="${band}"/>
    <rect y="10" width="${W}" height="4" fill="${band2}"/>
    ${d.crest ? `<image href="${d.crest}" x="${W - px - 110}" y="24" width="110" height="110" preserveAspectRatio="xMidYMid meet"/>` : ''}
    <text x="${px}" y="80" font-family="Oswald" font-weight="700" font-size="${fit(d.title, titleW - 260, 60, 28)}" fill="#ffffff">${esc(clip(String(d.title || 'Starting XI').toUpperCase(), 32))}</text>
    <text x="${px}" y="122" font-family="Inter" font-size="26" fill="rgba(255,255,255,0.75)">${esc(clip([d.formation, d.subtitle].filter(Boolean).join('  ·  '), 60))}</text>
    <defs><clipPath id="pc"><rect x="${px}" y="${top}" width="${pw}" height="${pitchH}" rx="22"/></clipPath></defs>
    <rect x="${px}" y="${top}" width="${pw}" height="${pitchH}" rx="22" fill="${P.a}"/>
    <g clip-path="url(#pc)">${stripes}</g>
    ${markings}
    ${starters}
    ${bench}
    <text x="${W - px}" y="${H - 24}" text-anchor="end" font-family="Inter" font-size="20" fill="rgba(255,255,255,0.5)">${esc(d.footer || 'GafferBot')}</text>
  </svg>`;
}

const renderBoard = (d) => G.render(boardSvg(d));

// Bring-in menu: the squad grouped by primary position (keeper, defence, midfield, attack), best
// rated first, players who are out last in their group. Discord shows 25 options, so a big squad
// keeps the best few of every position instead of cutting off the forwards.
function squadMenu(offSheet, info) {
  const entries = offSheet.map((p) => {
    const o = info.get(p.id);
    return { id: p.id, answer: p.answer, position: String(o?.tiers?.primary || o?.positions?.[0] || '').toUpperCase() || null, rating: Number(o?.rating) || 0, out: p.answer === 'no' };
  });
  const groups = groupByPosition(entries);
  let cap = Math.max(1, ...groups.map((g) => g.players.length));
  while (cap > 1 && groups.reduce((n, g) => n + Math.min(cap, g.players.length), 0) > 25) cap--;
  return groups.flatMap((g) => g.players.slice(0, cap)).slice(0, 25);
}

// Formation menu pages (the game has more formations than one 25-option menu holds)
function formationMenu(current, pageWanted) {
  const all = Object.keys(FORMATION_SLOTS);
  const per = 24; // one option left for the page switch
  const pages = Math.ceil(all.length / per);
  const page = Number.isInteger(pageWanted) ? Math.min(Math.max(pageWanted, 0), pages - 1) : Math.max(0, Math.floor(all.indexOf(current) / per));
  const options = all.slice(page * per, page * per + per).map((f) => ({ label: f, value: f, default: f === current }));
  if (pages > 1) options.push({ label: page + 1 < pages ? 'More formations ▸' : '◂ Back to the first formations', value: `page:${(page + 1) % pages}`, emoji: '📐' });
  return { options, page, pages };
}

function createLineupBoard(deps) {
  const { supabase, callEdgeFunction, getGuildState, resolveClub, canManageClub, dashboardUrl } = deps;
  const drafts = new Map(); // token -> editor state, bound to the member who opened it
  const cards = new Map(); // guildId:userId -> { at, image }

  const token = () => Math.random().toString(36).slice(2, 10);
  const sweep = () => {
    const now = Date.now();
    for (const [k, d] of drafts) if (now - d.at > DRAFT_TTL_MS) drafts.delete(k);
  };

  // Names, ratings and preferred positions for a set of players in this server
  async function playerInfo(guildId, ids) {
    const out = new Map(ids.map((id) => [id, { id, name: id.startsWith('ea_') ? id.slice(3) : 'Player', rating: null, positions: [], tiers: null }]));
    if (!ids.length) return out;
    const [{ data: summary }, { data: profiles }, { data: prefs }, { data: tiers }] = await Promise.all([
      supabase.from('player_summary').select('discord_user_id, discord_username, overall_rating, primary_position').eq('guild_id', guildId).in('discord_user_id', ids),
      supabase.from('profiles').select('discord_user_id, ea_username').in('discord_user_id', ids),
      supabase.from('position_preferences').select('user_id, preferences').eq('guild_id', guildId).in('user_id', ids),
      // Position tiers (comp / plays well / emergency); a server without the table yet just has none
      Promise.resolve(supabase.from('player_positions').select('discord_user_id, primary_position, secondary_positions, emergency_positions').eq('guild_id', guildId).in('discord_user_id', ids)).catch(() => ({ data: null })),
    ]);
    for (const p of profiles || []) if (p.ea_username) out.get(p.discord_user_id).name = p.ea_username;
    for (const s of summary || []) {
      const o = out.get(s.discord_user_id);
      if (s.discord_username) o.name = s.discord_username;
      o.rating = s.overall_rating ?? null;
      if (s.primary_position) o.positions = [s.primary_position];
    }
    for (const p of prefs || []) if (Array.isArray(p.preferences) && p.preferences.length) out.get(p.user_id).positions = p.preferences;
    for (const t of tiers || []) {
      const o = out.get(t.discord_user_id);
      if (!o || !t.primary_position && !t.secondary_positions?.length && !t.emergency_positions?.length) continue;
      o.tiers = { primary: t.primary_position || null, secondary: t.secondary_positions || [], emergency: t.emergency_positions || [] };
      o.positions = [o.tiers.primary, ...o.tiers.secondary].filter(Boolean);
    }
    return out;
  }

  // Each player's latest saved player card as a data URL (cached briefly; missing cards just fall
  // back to a kit jersey, so a storage hiccup never stops a lineup)
  async function cardImages(guildId, ids) {
    const out = new Map();
    const want = ids.filter((id) => /^\d{5,25}$/.test(id));
    const missing = [];
    for (const id of want) {
      const hit = cards.get(`${guildId}:${id}`);
      if (hit && Date.now() - hit.at < CARD_TTL_MS) { if (hit.image) out.set(id, hit.image); } else missing.push(id);
    }
    if (!missing.length || !supabase?.storage) return out;
    try {
      const { data } = await supabase.from('player_cards').select('discord_user_id, storage_path, created_at').eq('guild_id', guildId).in('discord_user_id', missing).order('created_at', { ascending: false }).limit(200);
      const latest = new Map();
      for (const c of data || []) if (!latest.has(c.discord_user_id)) latest.set(c.discord_user_id, c.storage_path);
      await Promise.all(missing.map(async (id) => {
        let image = null;
        const path = latest.get(id);
        if (path) {
          const signed = await supabase.storage.from('pro-photos').createSignedUrl(path, 600).catch(() => null);
          image = signed?.data?.signedUrl ? await G.fetchImage(signed.data.signedUrl) : null;
        }
        cards.set(`${guildId}:${id}`, { at: Date.now(), image });
        if (image) out.set(id, image);
      }));
    } catch { /* cards are decoration */ }
    return out;
  }

  async function brandingFor(guildId) {
    const { data } = await supabase.from('guild_settings').select('branding').eq('guild_id', guildId).maybeSingle();
    return data?.branding || {};
  }

  // The pitch image for a board (formation + starters/bench ids)
  async function imageFor({ guildId, formation, state, title, subtitle, kit, pitch, teamId, clubKey }) {
    const ids = [...state.starters.filter(Boolean), ...state.bench];
    const [info, art, branding, club] = await Promise.all([playerInfo(guildId, ids), cardImages(guildId, ids), brandingFor(guildId), clubFor(guildId, teamId, clubKey)]);
    const person = (id) => ({ name: info.get(id)?.name, rating: info.get(id)?.rating, card: art.get(id) || null });
    // The club's crest top right; a crest that won't load just leaves the corner empty
    const crestLink = crestUrl(club, branding);
    const crest = crestLink ? await G.fetchImage(crestLink).catch(() => null) : null;
    return renderBoard({
      title, subtitle, formation, kit: club ? kitOf(club, kit) : kit, pitch, crest,
      footer: typeof branding.footer === 'string' && branding.footer ? branding.footer : 'Team sheet from GafferBot',
      starters: state.starters.map((id) => (id ? person(id) : null)),
      bench: state.bench.map(person),
    });
  }

  async function loadLineup(lineupId) {
    const { data: lineup } = await supabase.from('lineups').select('id, guild_id, team_id, event_id, name, formation').eq('id', lineupId).maybeSingle();
    if (!lineup) return null;
    const { data: slots } = await supabase.from('lineup_slots').select('discord_user_id, slot_index, is_substitute').eq('lineup_id', lineupId).order('slot_index');
    return { ...lineup, slots: slots || [] };
  }

  async function clubFor(guildId, teamId, clubKey) {
    const state = await getGuildState(guildId).catch(() => null);
    const clubs = Object.values(state?.clubs || {});
    return (clubKey && clubs.find((c) => c?.key === clubKey)) || (teamId && clubs.find((c) => c?.team_id === teamId)) || resolveClub?.(state, null) || clubs[0] || null;
  }

  async function clubKitFor(guildId, teamId) {
    return kitOf(await clubFor(guildId, teamId));
  }

  // A saved lineup's image, for posts made without the editor (Announce Lineup, event lineups)
  async function imageForLineup(lineupId, extra = {}) {
    try {
      const lineup = await loadLineup(lineupId);
      if (!lineup) return null;
      const formation = FORMATION_SLOTS[lineup.formation] ? lineup.formation : DEFAULT_FORMATION;
      const state = slotsToBoard(lineup.slots, FORMATION_SLOTS[formation].length);
      return await imageFor({ guildId: lineup.guild_id, formation, state, title: lineup.name || 'Starting XI', kit: await clubKitFor(lineup.guild_id, lineup.team_id), teamId: lineup.team_id, ...extra });
    } catch (err) {
      console.warn(`[lineup-board] image ${lineupId}: ${err.message}`);
      return null;
    }
  }

  // Who can be brought in: the event's Available/Maybe answers first (with their tick), then the squad
  async function poolFor(d) {
    const answers = new Map();
    if (d.eventId) {
      const { data } = await supabase.from('player_availability').select('discord_user_id, response').eq('event_id', d.eventId);
      for (const r of data || []) answers.set(r.discord_user_id, r.response);
    }
    let ids = [];
    if (d.teamId) {
      const { data } = await supabase.from('team_rosters').select('discord_user_id').eq('team_id', d.teamId);
      ids = (data || []).map((r) => r.discord_user_id);
    }
    if (!ids.length) {
      const { data } = await supabase.from('player_summary').select('discord_user_id').eq('guild_id', d.guildId).order('overall_rating', { ascending: false }).limit(60);
      ids = (data || []).map((r) => r.discord_user_id);
    }
    const all = [...new Set([...answers.keys(), ...ids])];
    const rank = (id) => ({ yes: 0, maybe: 1 }[answers.get(id)] ?? (answers.get(id) === 'no' ? 3 : 2));
    return all.sort((a, b) => rank(a) - rank(b)).map((id) => ({ id, answer: answers.get(id) || null }));
  }

  async function view(d) {
    const positions = FORMATION_SLOTS[d.formation];
    const onSheet = [...d.state.starters.filter(Boolean), ...d.state.bench];
    const offSheet = d.pool.filter((p) => !onSheet.includes(p.id));
    const info = await playerInfo(d.guildId, [...new Set([...onSheet, ...offSheet.map((p) => p.id)])]);
    const pool = squadMenu(offSheet, info);
    const name = (id) => clip(info.get(id)?.name || 'Player', 60);
    const fits = (id) => {
      const o = info.get(id);
      if (o?.tiers) return [o.tiers.primary && `Comp ${o.tiers.primary}`, o.tiers.secondary.length && `also ${o.tiers.secondary.join('/')}`, o.tiers.emergency.length && `emergency ${o.tiers.emergency.join('/')}`].filter(Boolean).join(' · ');
      return (o?.positions || []).length ? `Plays ${o.positions.slice(0, 3).join('/')}` : '';
    };

    const png = await imageFor({ guildId: d.guildId, formation: d.formation, state: d.state, title: d.name, subtitle: d.subtitle, kit: d.kit, teamId: d.teamId, clubKey: d.clubKey });
    const rows = [];

    const sheetOpts = [
      ...d.state.starters.map((id, i) => (id ? { label: `${positions[i]} · ${name(id)}`, value: `p:${id}`, description: fits(id) || undefined, default: d.picked === id } : null)).filter(Boolean),
      ...d.state.bench.map((id) => ({ label: `Bench · ${name(id)}`, value: `p:${id}`, description: fits(id) || undefined, default: d.picked === id })),
    ];
    if (sheetOpts.length) {
      rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`lb_pick:${d.token}`).setPlaceholder('✋ Pick up a player on the sheet...').addOptions(sheetOpts.slice(0, 25).map(clean))));
    }
    if (pool.length) {
      rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`lb_pick:${d.token}:in`).setPlaceholder('➕ Bring in from the squad (by position, best first)...')
        .addOptions(pool.map((p) => clean({ label: `${p.position || 'Any'} · ${name(p.id)}${p.rating ? ` · ${Math.round(p.rating)}` : ''}`, value: `p:${p.id}`, emoji: p.answer ? ANSWER[p.answer] : undefined, description: fits(p.id) || undefined, default: d.picked === p.id })))));
    }
    if (d.picked) {
      const from = d.state.starters.indexOf(d.picked);
      const opts = positions.map((pos, i) => {
        const who = d.state.starters[i];
        if (i === from) return null;
        const tier = fitFor(info.get(d.picked), pos);
        return { label: `${pos} ${who ? `· swap with ${name(who)}` : '· open spot'}`, value: `s:${i}`, emoji: FIT_EMOJI[tier], description: FIT_TEXT[tier] };
      }).filter(Boolean);
      if (!d.state.bench.includes(d.picked) && d.state.bench.length < MAX_BENCH) opts.push({ label: 'Bench', value: 'b', emoji: '🪑' });
      if (from >= 0) for (const [k, id] of d.state.bench.entries()) opts.push({ label: `Sub on ${name(id)}`, value: `b:${k}`, emoji: '🔁' });
      if (onSheet.includes(d.picked)) opts.push({ label: 'Take out of the lineup', value: 'out', emoji: '❌' });
      rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`lb_to:${d.token}`).setPlaceholder(`📍 Drop ${clip(name(d.picked), 40)} on...`).addOptions(opts.slice(0, 25).map(clean))));
    }
    if (rows.length < 4) {
      const { options, page, pages } = formationMenu(d.formation, d.formPage);
      rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`lb_form:${d.token}`)
        .setPlaceholder(pages > 1 ? `📐 Formation (page ${page + 1}/${pages})` : '📐 Formation').addOptions(options)));
    }
    const buttons = [
      new ButtonBuilder().setCustomId(`lb_undo:${d.token}`).setLabel('Undo').setEmoji('↩️').setStyle(ButtonStyle.Secondary).setDisabled(!d.history.length),
      new ButtonBuilder().setCustomId(`lb_post:${d.token}`).setLabel('Save & Post').setEmoji('📢').setStyle(ButtonStyle.Success).setDisabled(!d.state.starters.some(Boolean)),
    ];
    if (dashboardUrl) {
      buttons.push(new ButtonBuilder().setURL(`${dashboardUrl.replace(/\/$/, '')}/lineup${d.sourceId ? `?lineup=${d.sourceId}` : d.eventId ? `?event=${d.eventId}` : ''}`).setLabel('Drag & drop on the web').setStyle(ButtonStyle.Link));
    }
    buttons.push(new ButtonBuilder().setCustomId(`lb_close:${d.token}`).setLabel('Close').setStyle(ButtonStyle.Secondary));
    rows.push(new ActionRowBuilder().addComponents(buttons));

    const filled = d.state.starters.filter(Boolean).length;
    const embed = new EmbedBuilder()
      .setColor(parseInt(kitColor(d.kit?.accent || d.kit?.primary, '#22c55e').slice(1), 16))
      .setTitle(`📋 ${clip(d.name, 200)}`)
      .setDescription(
        `${d.notice ? `${d.notice}\n\n` : ''}${d.picked ? `Holding **${name(d.picked)}**. Pick where to drop them: ⭐ comp position · 👍 plays it well · 🆘 emergency cover.` : 'Pick up a player, then drop them on a spot: a starter there swaps with them. Bring in someone new from the squad list.'}\n` +
          `**${filled}/${positions.length}** starters · **${d.state.bench.length}** on the bench · ${d.formation}`
      )
      .setImage('attachment://lineup.png');
    return { content: '', embeds: [embed], components: rows, files: [new AttachmentBuilder(png, { name: 'lineup.png' })], attachments: [] };
  }

  // Discord rejects empty descriptions; trim labels to its limits
  function clean(o) {
    const out = { ...o, label: clip(o.label, 100) };
    if (!out.description) delete out.description;
    else out.description = clip(out.description, 100);
    if (!out.default) delete out.default;
    return out;
  }

  // Open the editor on the squad's latest lineup (or an empty board)
  async function open(interaction, lineupId, club) {
    sweep();
    const lineup = lineupId && lineupId !== 'new' ? await loadLineup(lineupId) : null;
    if (lineup && lineup.guild_id !== interaction.guildId) return interaction.editReply({ content: '❌ That lineup belongs to another server.' });
    const formation = FORMATION_SLOTS[lineup?.formation] ? lineup.formation : DEFAULT_FORMATION;
    const d = {
      token: token(),
      at: Date.now(),
      userId: interaction.user.id,
      guildId: interaction.guildId,
      clubKey: club?.key || null,
      teamId: lineup?.team_id || club?.team_id || null,
      eventId: lineup?.event_id || null,
      sourceId: lineup?.id || null,
      name: lineup?.name || `${club?.name || 'Club'} Starting XI`,
      kit: kitOf(club),
      formation,
      state: lineup ? slotsToBoard(lineup.slots, FORMATION_SLOTS[formation].length) : { starters: Array(FORMATION_SLOTS[formation].length).fill(null), bench: [] },
      history: [],
      picked: null,
      notice: null,
    };
    if (d.eventId) {
      const { data: ev } = await supabase.from('availability_events').select('title, scheduled_at').eq('id', d.eventId).maybeSingle();
      if (ev) d.subtitle = ev.title;
    }
    d.pool = await poolFor(d);
    drafts.set(d.token, d);
    await interaction.editReply(await view(d));
  }

  const commit = (d, next) => {
    if (next === d.state) return false;
    d.history = [...d.history, { state: d.state, formation: d.formation }].slice(-HISTORY);
    d.state = next;
    return true;
  };

  async function save(d) {
    const positions = FORMATION_SLOTS[d.formation];
    const slots = boardToSlots(d.state, positions);
    const { data: lineup, error } = await supabase
      .from('lineups')
      .insert({ guild_id: d.guildId, team_id: d.teamId, event_id: d.eventId, name: d.name, formation: d.formation, created_by_discord_id: d.userId, share_code: Math.random().toString(36).slice(2, 10).toUpperCase() })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    const { error: slotError } = await supabase.from('lineup_slots').insert(slots.map((s) => ({ ...s, lineup_id: lineup.id })));
    if (slotError) throw new Error(slotError.message);
    return lineup.id;
  }

  // Post where this squad's team sheet went last (so it's edited in place), else this channel
  async function channelFor(d, fallback) {
    let query = supabase.from('lineups').select('channel_id').eq('guild_id', d.guildId).not('channel_id', 'is', null).order('updated_at', { ascending: false }).limit(1);
    if (d.eventId) query = query.eq('event_id', d.eventId);
    else if (d.teamId) query = query.eq('team_id', d.teamId);
    const { data } = await query.maybeSingle();
    return data?.channel_id || fallback;
  }

  async function handleInteraction(interaction) {
    if (!(interaction.isButton() || interaction.isStringSelectMenu())) return false;
    const [action, arg, extra] = interaction.customId.split(':');
    if (!action.startsWith('lb_')) return false;

    if (action === 'lb_open') {
      const state = await getGuildState(interaction.guildId);
      const club = resolveClub(state, interaction.member, extra);
      if (!club || !(await canManageClub(interaction.member, club))) {
        await interaction.reply({ content: `❌ Only ${club ? `${club.name}'s` : 'club'} leaders can edit the lineup.`, flags: 64 });
        return true;
      }
      await interaction.deferReply({ flags: 64 });
      await open(interaction, arg, club).catch((err) => interaction.editReply({ content: `❌ Could not open the lineup: ${err.message}` }));
      return true;
    }

    const d = drafts.get(arg);
    if (!d) {
      await interaction.update({ content: 'This lineup editor expired. Open it again from **/manager → Team Sheet**.', embeds: [], components: [], attachments: [] }).catch(() => {});
      return true;
    }
    if (d.userId !== interaction.user.id) {
      await interaction.reply({ content: 'This editor belongs to whoever opened it. Open your own from **/manager → Team Sheet**.', flags: 64 });
      return true;
    }
    d.at = Date.now();
    d.notice = null;

    if (action === 'lb_close') {
      drafts.delete(d.token);
      await interaction.update({ content: 'Lineup editor closed. Nothing was posted.', embeds: [], components: [], attachments: [] });
      return true;
    }

    // Rendering pulls card art, so acknowledge first
    await interaction.deferUpdate();

    if (action === 'lb_post') {
      try {
        const lineupId = await save(d);
        const channelId = await channelFor(d, interaction.channelId);
        const png = await imageFor({ guildId: d.guildId, formation: d.formation, state: d.state, title: d.name, subtitle: d.subtitle, kit: d.kit, teamId: d.teamId, clubKey: d.clubKey });
        const { error, data } = await callEdgeFunction('announce-lineup', {
          action: 'announce', lineup_id: lineupId, channel_id: channelId, mention_players: true, dm_players: false, message: '',
          image_base64: Buffer.from(png).toString('base64'),
        }, 30000);
        if (error || !data?.success) throw new Error(error || data?.error || 'unknown error');
        drafts.delete(d.token);
        const changes = data.changes;
        const changeNote = changes ? ` ${[changes.added && `${changes.added} in`, changes.removed && `${changes.removed} out`, changes.moved && `${changes.moved} moved`].filter(Boolean).join(', ')}.` : '';
        await interaction.editReply({ content: `✅ ${data.updated ? 'Team sheet updated' : 'Lineup posted'} in <#${channelId}> and the starting XI pinged.${changeNote}`, embeds: [], components: [], attachments: [] });
      } catch (err) {
        d.notice = `❌ Could not post the lineup: ${err.message}`;
        await interaction.editReply(await view(d));
      }
      return true;
    }

    if (action === 'lb_pick') {
      const value = interaction.values[0] || '';
      d.picked = value.startsWith('p:') ? value.slice(2) : null;
    } else if (action === 'lb_to' && d.picked) {
      const v = interaction.values[0];
      const to = v === 'out' ? { zone: 'pool' } : v === 'b' ? { zone: 'bench' } : v.startsWith('b:') ? { zone: 'bench', index: Number(v.slice(2)) } : { zone: 'pitch', index: Number(v.slice(2)) };
      if (!commit(d, movePlayer(d.state, d.picked, to))) d.notice = '⚠️ That move is not possible (the bench holds 9).';
      d.picked = null;
    } else if (action === 'lb_form') {
      const formation = interaction.values[0];
      if (formation.startsWith('page:')) d.formPage = Number(formation.slice(5)) || 0;
      else if (FORMATION_SLOTS[formation] && formation !== d.formation) {
        d.history = [...d.history, { state: d.state, formation: d.formation }].slice(-HISTORY);
        d.state = resizeBoard(d.state, FORMATION_SLOTS[formation].length);
        d.formation = formation;
      }
    } else if (action === 'lb_undo') {
      const last = d.history.pop();
      if (last) {
        d.state = last.state;
        d.formation = last.formation;
      }
      d.picked = null;
    } else return false;

    await interaction.editReply(await view(d));
    return true;
  }

  return { handleInteraction, imageForLineup, open };
}

module.exports = { createLineupBoard, boardSvg, renderBoard, fitFor, squadMenu, formationMenu };
