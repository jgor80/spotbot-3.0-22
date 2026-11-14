// Personal kits for Social Hub players: on a hub server the Photo Studio draws your player card in the
// kit YOU picked, from every kit GafferBot has.
//   Catalogue  GafferBot's own classic kits (original designs, no real clubs or brands), the built-in
//              Palermo kits, this server's clubs and teams, and the clubs of every server in the
//              GafferBot Network (servers that opted in to sharing public club info).
//   Popular    the 50 most picked kits (kit_popularity) are cached in memory, refreshed every
//              10 minutes, and shown first as two numbered swatch sheets drawn locally (no AI).
//   Pick       My kit: two menus of popular kits, Search all kits (a name search over the whole
//              catalogue), or back to club colours. Saved on the player's profile (profiles.studio_kit),
//              so it follows them to every hub server. Nothing here pings anyone.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const G = require('./graphics.cjs');
const { kitOf } = require('./club-colors.cjs');

const NO_PINGS = { parse: [] };
const POPULAR = 50;
const CACHE_MS = 10 * 60 * 1000;
const CATALOGUE_MS = 30 * 60 * 1000;

// Original GafferBot designs: colours and patterns only, never a real club's kit or a brand
const CLASSIC = [
  ['crimson-sleeves', 'Crimson & White Sleeves', '#b91c1c', '#ffffff', 'crimson shirt with white sleeves and a white crew collar, white shorts'],
  ['black-white-stripes', 'Black & White Stripes', '#111111', '#ffffff', 'vertical black and white striped shirt, black collar, black shorts'],
  ['sky-blue', 'Sky Blue Classic', '#7dd3fc', '#ffffff', 'sky blue shirt with a white polo collar and cuffs, white shorts'],
  ['royal-hoops', 'Royal Blue Hoops', '#1d4ed8', '#ffffff', 'royal blue and white horizontal hooped shirt, white shorts'],
  ['claret-blue', 'Claret & Blue', '#7f1d1d', '#60a5fa', 'claret shirt with light blue sleeves and collar, white shorts'],
  ['amber-black', 'Amber & Black', '#f59e0b', '#111111', 'amber shirt with black V-neck collar, cuffs and side panels, black shorts'],
  ['all-white', 'All White', '#ffffff', '#1f2937', 'plain white shirt with a thin charcoal collar trim, white shorts'],
  ['green-white-hoops', 'Green & White Hoops', '#15803d', '#ffffff', 'emerald green and white horizontal hooped shirt, white shorts'],
  ['red-black-stripes', 'Red & Black Stripes', '#dc2626', '#111111', 'vertical red and black striped shirt, black shorts'],
  ['navy-gold', 'Navy & Gold', '#1e3a8a', '#facc15', 'navy shirt with gold collar, cuffs and pinstripe, navy shorts'],
  ['orange-sash', 'Orange Sash', '#ffffff', '#f97316', 'white shirt with a wide diagonal orange sash from shoulder to hip, white shorts'],
  ['purple-reign', 'Purple Reign', '#6d28d9', '#e9d5ff', 'deep purple shirt with lilac collar and sleeve trim, purple shorts'],
  ['teal-wave', 'Teal Wave', '#0d9488', '#ccfbf1', 'teal shirt with a pale aqua wave pattern across the chest, teal shorts'],
  ['halves', 'Red & White Halves', '#dc2626', '#ffffff', 'shirt split vertically down the middle, red left half and white right half, red shorts'],
  ['blackout', 'Blackout', '#0a0a0a', '#3f3f46', 'all-black shirt with tonal dark grey geometric pattern, black shorts'],
  ['retro-gold', 'Retro Gold', '#eab308', '#14532d', '1980s gold cotton shirt with a dark green knitted polo collar, dark green shorts'],
  ['pink-pop', 'Pink Pop', '#ec4899', '#111111', 'hot pink shirt with black crew collar and black cuffs, black shorts'],
  ['ice', 'Ice', '#e0f2fe', '#0369a1', 'icy pale blue shirt with deep blue chevron across the chest, pale blue shorts'],
  ['maroon-pinstripe', 'Maroon Pinstripe', '#7f1d1d', '#fde68a', 'maroon shirt with thin cream pinstripes and cream collar, maroon shorts'],
  ['lime-volt', 'Volt', '#a3e635', '#111111', 'neon volt lime shirt with black side panels and black collar, black shorts'],
].map(([key, label, primary, secondary, description]) => ({ key: `classic:${key}`, label, primary, secondary, description, source: 'GafferBot classic' }));

const { kitsFor } = require('./club-kits.cjs');
const PALERMO = kitsFor({ name: 'Palermo' }).map((k) => ({ key: `palermo:${k.key}`, label: `Palermo ${k.label}`, primary: k.primary, secondary: k.secondary, description: k.description, source: 'Palermo' }));

// A club's kit as a catalogue entry, or null when it has no colours
function clubKit(guildId, club) {
  const k = kitOf(club);
  if (!k.primary && !k.secondary) return null;
  return { key: `club:${guildId}:${club.key}`, label: `${club.name}`.slice(0, 60), primary: k.primary || null, secondary: k.secondary || null, description: k.description || null, source: 'club' };
}

// Search: every word must appear in the label or source
function search(catalogue, query, limit = 25) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return catalogue.slice(0, limit);
  return catalogue.filter((k) => words.every((w) => `${k.label} ${k.source}`.toLowerCase().includes(w))).slice(0, limit);
}

const colourName = (c) => String(c || '').startsWith('#') ? c.toUpperCase() : c || '';

// Colour words kits are described with (Palermo, typed club kits) for the swatches
const NAMED = {
  'pale pink': '#f9c6d3', pink: '#ec4899', black: '#111111', white: '#ffffff', peach: '#fbb98b', 'lime yellow': '#d9f99d', lime: '#a3e635',
  anthracite: '#2b2d31', 'anthracite black': '#2b2d31', red: '#dc2626', blue: '#2563eb', navy: '#1e3a8a', green: '#15803d', yellow: '#facc15',
  gold: '#eab308', orange: '#f97316', purple: '#6d28d9', grey: '#6b7280', gray: '#6b7280', silver: '#cbd5e1', maroon: '#7f1d1d', claret: '#7f1d1d',
  teal: '#0d9488', sky: '#7dd3fc', 'sky blue': '#7dd3fc', cream: '#fef3c7', brown: '#78350f',
};
function namedColour(c) {
  const t = String(c || '').toLowerCase().trim();
  if (NAMED[t]) return NAMED[t];
  const word = t.split(/\s+/).reverse().find((w) => NAMED[w]);
  return word ? NAMED[word] : null;
}

// Numbered shirt swatches, drawn locally
function swatchSheet(kits, title) {
  const cols = 5;
  const W = 1000, cell = 200, top = 90;
  const H = top + Math.ceil(Math.max(kits.length, 1) / cols) * cell + 20;
  const fill = (c, fb) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : namedColour(c) || fb);
  const shirt = (x, y, k, n) => {
    const p = fill(k.primary, '#64748b');
    const s = fill(k.secondary, '#e2e8f0');
    return `<g transform="translate(${x},${y})">
      <path d="M50 20 L80 8 Q100 22 120 8 L150 20 L172 52 L148 66 L140 56 L140 150 L60 150 L60 56 L52 66 L28 52 Z" fill="${p}" stroke="${s}" stroke-width="5"/>
      <path d="M80 8 Q100 30 120 8" fill="none" stroke="${s}" stroke-width="7"/>
      <rect x="60" y="120" width="80" height="10" fill="${s}" opacity="0.8"/>
      <text x="100" y="98" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="34" fill="${s}">${n}</text>
      <text x="100" y="180" text-anchor="middle" font-family="Inter" font-size="15" fill="#e2e8f0">${G.esc(String(k.label).slice(0, 22))}</text>
    </g>`;
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#0b1220"/>
    <text x="40" y="58" font-family="Oswald" font-weight="700" font-size="32" letter-spacing="3" fill="#e2e8f0">${G.esc(title)}</text>
    ${kits.map((k, i) => shirt((i % cols) * cell, top + Math.floor(i / cols) * cell, k, i + 1)).join('')}
  </svg>`;
  return G.render(svg);
}

function createKitCatalog(deps) {
  const { supabase, getGuildState, hubOf } = deps;
  let popular = { at: 0, list: [] };
  const catalogues = new Map(); // guildId -> { at, list }

  async function networkKits() {
    const { data: servers } = await supabase.from('network_servers').select('guild_id').eq('enabled', true).is('suspended_at', null).limit(500);
    const ids = (servers || []).map((s) => s.guild_id);
    if (!ids.length) return [];
    const { data } = await supabase.from('guild_settings').select('guild_id, clubs').in('guild_id', ids);
    return (data || []).flatMap((g) => (g.clubs || []).filter((c) => c.enabled && !/^(Club|Lobby) \d+$/.test(c.name || '')).map((c) => clubKit(g.guild_id, c)).filter(Boolean));
  }

  // Everything this server's players can pick from
  async function catalogue(guildId) {
    const hit = catalogues.get(guildId);
    if (hit && Date.now() - hit.at < CATALOGUE_MS) return hit.list;
    const state = await getGuildState(guildId).catch(() => null);
    const own = (state?.clubs || []).filter((c) => c.enabled && !/^(Club|Lobby) \d+$/.test(c.name || '')).map((c) => clubKit(guildId, c)).filter(Boolean);
    const network = await networkKits().catch(() => []);
    const seen = new Set();
    const list = [...CLASSIC, ...PALERMO, ...own, ...network].filter((k) => !seen.has(k.key) && seen.add(k.key));
    catalogues.set(guildId, { at: Date.now(), list });
    return list;
  }

  // The 50 most picked kits, with the classics topping it up while picks are few
  async function popularKits() {
    if (Date.now() - popular.at < CACHE_MS && popular.list.length) return popular.list;
    const { data } = await supabase.from('kit_popularity').select('kit_key, kit, picks').order('picks', { ascending: false }).limit(POPULAR);
    const picked = (data || []).map((r) => ({ ...r.kit, key: r.kit_key, picks: r.picks }));
    const keys = new Set(picked.map((k) => k.key));
    popular = { at: Date.now(), list: [...picked, ...CLASSIC.filter((k) => !keys.has(k.key)), ...PALERMO.filter((k) => !keys.has(k.key))].slice(0, POPULAR) };
    return popular.list;
  }

  async function myKit(userId) {
    const { data } = await supabase.from('profiles').select('studio_kit').eq('discord_user_id', userId).maybeSingle();
    return data?.studio_kit && typeof data.studio_kit === 'object' && data.studio_kit.key ? data.studio_kit : null;
  }

  // The kit a player card on this server should use: theirs on a Social Hub server
  async function personalKit(guildId, userId) {
    const hub = await hubOf(guildId).catch(() => ({}));
    if (!hub?.on) return null;
    return myKit(userId);
  }

  async function choose(userId, kit) {
    const clean = kit ? { key: kit.key, label: kit.label, primary: kit.primary || null, secondary: kit.secondary || null, description: kit.description || null } : null;
    const { data: row } = await supabase.from('profiles').select('discord_user_id').eq('discord_user_id', userId).maybeSingle();
    const { error } = row
      ? await supabase.from('profiles').update({ studio_kit: clean }).eq('discord_user_id', userId)
      : await supabase.from('profiles').insert({ discord_user_id: userId, studio_kit: clean });
    if (error) return error.message;
    if (clean) {
      const { error: e } = await supabase.rpc('bump_kit_popularity', { p_key: clean.key, p_kit: clean });
      if (e) console.warn(`[kits] popularity bump failed: ${e.message}`);
      popular.at = 0;
    }
    return null;
  }

  // ---------- Views ----------

  const menu = (id, kits, offset, placeholder) =>
    new StringSelectMenuBuilder()
      .setCustomId(id)
      .setPlaceholder(placeholder)
      .addOptions(kits.map((k, i) => ({ label: `${offset + i + 1}. ${k.label}`.slice(0, 100), description: `${[colourName(k.primary), colourName(k.secondary)].filter(Boolean).join(' / ')} · ${k.source}`.slice(0, 100), value: k.key.slice(0, 100) })));

  async function picker(userId, note = null) {
    const [kits, mine] = await Promise.all([popularKits(), myKit(userId)]);
    const first = kits.slice(0, 25);
    const second = kits.slice(25, 50);
    const files = [new AttachmentBuilder(swatchSheet(first, 'POPULAR KITS 1-25'), { name: 'kits-1.png' })];
    if (second.length) files.push(new AttachmentBuilder(swatchSheet(second, 'POPULAR KITS 26-50'), { name: 'kits-2.png' }));
    const embed = new EmbedBuilder()
      .setTitle('👕 My kit')
      .setColor(0x2ecc71)
      .setDescription(
        [
          note,
          `Your player cards on Social Hub servers are drawn in **${mine ? mine.label : 'the club colours'}**.`,
          'Pick one of the 50 most popular kits, or **Search all kits**: GafferBot classics, Palermo, this server\'s clubs and every club in the GafferBot Network.',
          'Then make your card in the **Photo Studio** (Player Card).',
        ].filter(Boolean).join('\n\n')
      );
    const rows = [new ActionRowBuilder().addComponents(menu('kc_pick:0', first, 0, 'Popular kits 1-25'))];
    if (second.length) rows.push(new ActionRowBuilder().addComponents(menu('kc_pick:1', second, 25, 'Popular kits 26-50')));
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('kc_search').setLabel('Search all kits').setEmoji('🔎').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('kc_clear').setLabel('Use club colours').setStyle(ButtonStyle.Secondary).setDisabled(!mine)
      )
    );
    return { embeds: [embed], components: rows, files, allowedMentions: NO_PINGS };
  }

  async function resultsView(guildId, query) {
    const found = search(await catalogue(guildId), query);
    if (!found.length) return { content: `🔎 No kits match **${String(query).slice(0, 40)}**. Try a colour or a club name.`, embeds: [], components: [], files: [] };
    return {
      content: `🔎 ${found.length} kit${found.length === 1 ? '' : 's'} for **${String(query).slice(0, 40)}**:`,
      embeds: [],
      files: [new AttachmentBuilder(swatchSheet(found, 'SEARCH RESULTS'), { name: 'kits-search.png' })],
      components: [new ActionRowBuilder().addComponents(menu('kc_pick:s', found, 0, 'Pick a kit'))],
      allowedMentions: NO_PINGS,
    };
  }

  // ---------- Interactions ----------

  async function handleInteraction(interaction) {
    const id = interaction.customId || '';
    if (!id.startsWith('kc_') || !interaction.guildId) return false;
    if (id === 'kc_open' && interaction.isButton?.()) {
      await interaction.deferReply({ flags: 64 });
      await interaction.editReply(await picker(interaction.user.id));
      return true;
    }
    if (id === 'kc_search' && interaction.isButton?.()) {
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId('kc_search_m')
          .setTitle('Search all kits')
          .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q').setLabel('Colour, pattern or club name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40)))
      );
      return true;
    }
    if (id === 'kc_search_m' && interaction.isModalSubmit?.()) {
      await interaction.deferReply({ flags: 64 });
      await interaction.editReply(await resultsView(interaction.guildId, interaction.fields.getTextInputValue('q')));
      return true;
    }
    if (id.startsWith('kc_pick:') && interaction.isStringSelectMenu?.()) {
      await interaction.deferUpdate();
      const key = interaction.values?.[0];
      const kit = (await popularKits()).find((k) => k.key === key) || (await catalogue(interaction.guildId)).find((k) => k.key === key);
      if (!kit) {
        await interaction.followUp({ content: '❌ That kit is gone. Pick another.', flags: 64 });
        return true;
      }
      const err = await choose(interaction.user.id, kit);
      await interaction.editReply({ content: err ? `❌ ${err}` : `👕 Saved: **${kit.label}**. Your next player card on a Social Hub server is drawn in it.`, embeds: [], components: [], files: [] });
      return true;
    }
    if (id === 'kc_clear' && interaction.isButton?.()) {
      await interaction.deferUpdate();
      const err = await choose(interaction.user.id, null);
      await interaction.editReply(await picker(interaction.user.id, err ? `❌ ${err}` : '✅ Back to the club colours.'));
      return true;
    }
    return false;
  }

  return { handleInteraction, personalKit, myKit, catalogue, popularKits, choose, picker };
}

module.exports = { createKitCatalog, CLASSIC, PALERMO, clubKit, search, swatchSheet };
