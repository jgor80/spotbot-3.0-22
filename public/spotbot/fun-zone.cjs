// Fun Zone: banter that keeps the server lively even through a bad run.
//   /fun roast    tongue-in-cheek awards from the latest night's real EA numbers (also auto-added
//                 to the session recap after a night with a loss)
//   /fun presser  a mock press conference: a tabloid question with three answer buttons
//   /fun rumour   a made-up transfer "exclusive" about a squad member (labelled fiction)
//   /fun quote    save a voice-chat quote; /fun quotes pulls a random one back out
//   /fun curse    the curse: 2+ straight losses curse the club until members break it
// Roast awards only use numbers that exist in the match data; anything invented is labelled.
// Names, colours and jokes follow the club's voice (club-identity.cjs): the Italian voice keeps the
// Malocchio and the pasta, the others get their own. Press questions are about the club's real last
// result, and nobody gets roasted two nights running.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { activeClubs, resolveClub } = require('./manager-hub.cjs');
const { toSessions } = require('./coach.cjs');
const { identityOf } = require('./club-identity.cjs');
const { clubAccent } = require('./club-colors.cjs');

const PINK = 0xf4a7c4;

// The club's voice decides what the curse is called and how the Fun Zone talks
const FUN_VOICE = {
  italian: { roast: '🍝 The Roast', curse: 'Malocchio', curseEmoji: '🧿', cheer: 'Forza!', snack: 'pasta', philosophy: 'Football is like the sea in Mondello. Sometimes it is calm. Tonight it drowned us.' },
  british: { roast: '🔥 The Roast', curse: 'Hoodoo', curseEmoji: '🪄', cheer: 'Get in!', snack: 'a flask of tea', philosophy: 'Football is like the weather up north. You bring a coat and it still finds a way to soak you.' },
  american: { roast: '🔥 The Roast', curse: 'Jinx', curseEmoji: '🐈‍⬛', cheer: "Let's go!", snack: 'protein bars', philosophy: "Football is like a road trip. Sometimes you hit every green light. Tonight we got a flat tire in the desert." },
  spanish: { roast: '🌶️ The Roast', curse: 'Mal de Ojo', curseEmoji: '🧿', cheer: '¡Vamos!', snack: 'churros', philosophy: 'Football is like the sea in Cádiz. Sometimes it is calm. Tonight it took our towels.' },
  plain: { roast: '🔥 The Roast', curse: 'Curse', curseEmoji: '🧿', cheer: 'Well played.', snack: 'a water bottle', philosophy: 'Football is like the sea. Sometimes it is calm. Tonight it was not.' },
};
const funVoice = (club) => FUN_VOICE[identityOf(club).voice] || FUN_VOICE.plain;
const funColor = (club) => clubAccent(club, null, PINK);
const MAX_QUOTES = 200;
const CURSE_STREAK = 2;
const RITUAL_TARGET = 3;

const FUN_COMMAND = {
  name: 'fun',
  description: 'Banter tools: roasts, press conferences, rumours, quotes and the curse.',
  options: [
    {
      type: 1,
      name: 'panel',
      description: 'Post the Fun Zone panel with buttons for every banter tool.',
      options: [{ type: 5, name: 'post', description: 'Post it for everyone (from /me it only shows to you unless this is on).', required: false }],
    },
    { type: 1, name: 'roast', description: 'Tongue-in-cheek awards from the latest night of games.' },
    { type: 1, name: 'presser', description: 'Face the tabloid press after the match.' },
    {
      type: 1,
      name: 'rumour',
      description: 'A totally made-up transfer exclusive.',
      options: [{ type: 6, name: 'player', description: 'Who the rumour is about', required: false }],
    },
    {
      type: 1,
      name: 'quote',
      description: 'Save something said in voice chat.',
      options: [
        { type: 3, name: 'text', description: 'What was said', required: true, max_length: 300 },
        { type: 6, name: 'who', description: 'Who said it', required: false },
      ],
    },
    { type: 1, name: 'quotes', description: 'Pull a random quote from the archive.' },
    { type: 1, name: 'curse', description: 'Check (or break) the Malocchio on the club.' },
  ],
};

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const nameOf = (p) => String(p.ea_username || p.name || 'Someone').trim();

// Per-player totals for one night (only players who actually appeared)
function nightTotals(matches) {
  const map = new Map();
  for (const m of matches) {
    for (const p of m.players || []) {
      const name = nameOf(p);
      const t = map.get(name) || { name, games: 0, goals: 0, assists: 0, shots: 0, onTarget: 0, passes: 0, passAtt: 0, tackles: 0, tackleAtt: 0, reds: 0, saves: 0, gk: 0 };
      t.games += 1;
      t.goals += n(p.goals);
      t.assists += n(p.assists);
      t.shots += n(p.shots);
      t.onTarget += n(p.shots_on_target);
      t.passes += n(p.passes_made);
      t.passAtt += n(p.pass_attempts);
      t.tackles += n(p.tackles);
      t.tackleAtt += n(p.tackle_attempts);
      t.reds += n(p.red_cards);
      t.saves += n(p.saves);
      if (String(p.position || '').toLowerCase().match(/^(gk|goalkeeper)$/)) t.gk += 1;
      map.set(name, t);
    }
  }
  return [...map.values()];
}

// Each award needs a real qualifying number; awards nobody qualifies for are skipped
// lastRoasted: names roasted last time, who get a night off unless nobody else qualifies
function roastAwards(matches, club, lastRoasted = []) {
  const players = nightTotals(matches);
  const out = [];
  const used = new Set();
  const spared = new Set(lastRoasted.map((x) => String(x).toLowerCase()));
  const award = (title, list, line) => {
    const free = list.filter((x) => !used.has(x.name));
    const p = free.find((x) => !spared.has(x.name.toLowerCase())) || (out.length ? null : free[0]);
    if (!p) return;
    used.add(p.name);
    out.push({ title, text: line(p), name: p.name });
  };
  const outfield = players.filter((p) => p.gk < p.games);
  award(
    '🎯 Sniper on the Grassy Knoll',
    outfield.filter((p) => p.shots >= 4 && p.goals === 0).sort((a, b) => b.shots - a.shots),
    (p) => `**${p.name}** — ${p.shots} shots, ${p.onTarget} on target, 0 goals. ${pick(['The corner flag is still shaking.', 'The ball boys have asked for danger money.', 'Somewhere a pigeon is still recovering.'])}`
  );
  award(
    '🏃 The Cardio King',
    outfield.filter((p) => p.games >= 2 && p.goals + p.assists + p.tackles === 0).sort((a, b) => b.games - a.games),
    (p) => `**${p.name}** — ${p.games} games, zero goals, assists or tackles. ${pick(['Elite step count though.', 'Fitness tracker very impressed.', 'Ran a marathon, carried nothing.'])}`
  );
  award(
    '🚑 Hospital Ball Distributor',
    outfield.filter((p) => p.passAtt >= 15).sort((a, b) => a.passes / a.passAtt - b.passes / b.passAtt),
    (p) => `**${p.name}** — ${Math.round((100 * p.passes) / p.passAtt)}% passing (${p.passes}/${p.passAtt}). ${pick(['Every pass came with a medical bill.', 'Teammates are now asking for insurance.', 'Gifts for the opposition, wrapped and delivered.'])}`
  );
  award(
    '🪓 The Enforcer',
    outfield.filter((p) => p.reds > 0).sort((a, b) => b.reds - a.reds),
    (p) => `**${p.name}** — ${p.reds} red card${p.reds > 1 ? 's' : ''}. Chose violence, got an early shower.`
  );
  award(
    '🧱 Brick Wall of Regret',
    players.filter((p) => p.gk > 0 && p.saves >= 5).sort((a, b) => b.saves - a.saves),
    (p) => `**${p.name}** — ${p.saves} saves. ${pick(['Did their job; the other ten owe them dinner.', 'Busier than a shop on Black Friday.', 'Deserves a raise and a holiday.'])}`
  );
  award(
    `👻 Ghost of ${identityOf(club).city}`,
    outfield.filter((p) => p.passAtt + p.shots + p.tackleAtt <= 8 * p.games).sort((a, b) => a.passAtt + a.shots + a.tackleAtt - (b.passAtt + b.shots + b.tackleAtt)),
    (p) => `**${p.name}** — ${p.passAtt} passes tried, ${p.shots} shots, ${p.tackleAtt} tackles in ${p.games} game${p.games > 1 ? 's' : ''}. ${pick(['Witnesses unsure they were there.', 'Last seen near the halfway line.', 'Missing person posters are going up.'])}`
  );
  return out;
}

function record(matches) {
  const w = matches.filter((m) => m.result === 'win').length;
  const d = matches.filter((m) => m.result === 'draw').length;
  return { w, d, l: matches.length - w - d };
}

function roastEmbed(club, night, awards = roastAwards(night, club, club.fun?.last_roast || [])) {
  const r = record(night);
  const e = new EmbedBuilder()
    .setColor(funColor(club))
    .setTitle(`${funVoice(club).roast} — ${club.name || 'the club'}`)
    .setDescription(`Night record **${r.w}-${r.d}-${r.l}**. All numbers are real; the feelings are ours.`)
    .setFooter({ text: 'Banter only. Hug your teammates.' });
  if (!awards.length) e.addFields({ name: 'No roast tonight', value: 'Nobody did anything ridiculous enough. Suspicious.' });
  for (const a of awards) e.addFields({ name: a.title, value: a.text });
  return e;
}

// Current losing streak from the newest match back
function lossStreak(matches) {
  let s = 0;
  for (const m of matches) {
    if (m.result !== 'loss') break;
    s += 1;
  }
  return s;
}

const PRESS_QUESTIONS = [
  'Gaffer, the fans are burning their scarves outside. Do you still have the dressing room?',
  'Is it true the squad spent half-time arguing about whose turn it was to defend?',
  'Sources say the board has "full confidence" in you. How long do you have?',
  'Your striker hasn\'t scored since the Renaissance. Will he start next week?',
  'Was tonight\'s defending a tactic, or a cry for help?',
];
// Questions about the club's real last game, so the presser is about tonight and not a stock line
function pressQuestionsFor(last) {
  if (!last) return PRESS_QUESTIONS;
  const o = last.opponent && last.opponent !== 'Unknown' ? last.opponent : 'the opposition';
  const score = `${last.scoreFor}-${last.scoreAgainst}`;
  const top = [...(last.players || [])].sort((a, b) => n(b.goals) - n(a.goals) || n(b.rating) - n(a.rating))[0];
  const qs = [];
  if (last.result === 'loss') {
    qs.push(`${o} beat you ${score}. Be honest: were you outplayed or out-thought?`, `${last.scoreAgainst} conceded against ${o}. Is the back line still in the building?`);
    if (top && n(top.goals)) qs.push(`${nameOf(top)} scored and you still lost. Does ${nameOf(top)} need better teammates?`);
  } else if (last.result === 'win') {
    qs.push(`${score} against ${o}. Is this the best side you've ever managed?`, `Some say ${o} made it easy for you tonight. Fair?`);
    if (top && n(top.goals) >= 2) qs.push(`${nameOf(top)} scored ${n(top.goals)} tonight. Is a new contract on the table, or a transfer request?`);
  } else {
    qs.push(`${score} with ${o}. A point gained or two dropped?`, `Nobody could separate you and ${o}. Was that the plan?`);
  }
  return [...qs, ...PRESS_QUESTIONS.slice(0, 2)];
}

function pressAnswersFor(club) {
  const v = funVoice(club);
  return [
    ['Blame the referee', '"I won\'t comment on the officials. I will simply stare at this microphone for 40 seconds."'],
    ['Blame the servers', '"On my screen we were 3-0 up. EA owes this club an apology and three points."'],
    ['6 AM fitness drills', `"Training starts at 6 AM tomorrow. Bring ${v.snack}. Bring tears."`],
    ['Praise the opponent', '"Credit to them. Nobody said it had to be fair, nobody said it had to be fun."'],
    ['Walk out', '*The manager stands up, adjusts their scarf and leaves without a word.*'],
    ['Philosophical', `"${v.philosophy}"`],
  ];
}

// {p} the player, {city} the club's hometown. Italian-voiced clubs also get the Sicilian set.
const RUMOURS = [
  '🚨 EXCLUSIVE: {p} reportedly stormed out of the post-match buffet. Saudi clubs monitoring. Here we go? 🤔',
  '🚨 {p} spotted at {city} airport carrying a suitcase and a single sandwich. Agents deny everything.',
  '🚨 BREAKING: {p} has asked to play as a box-to-box goalkeeper. The board is "considering it".',
  '🚨 Reports: {p} has demanded his own personal hairdresser on the bench. Talks ongoing.',
];
const VOICE_RUMOURS = {
  italian: [
    '🚨 EXCLUSIVE: {p} reportedly stormed out of the post-match pasta buffet. Saudi clubs monitoring. Here we go? 🤔',
    '🚨 {p} spotted at {city} airport carrying a suitcase and a single cannoli. Agents deny everything.',
    '🚨 {p} linked with a shock loan move to a Sunday league side in Catania. Fee: two arancini.',
    '🚨 {p} rumoured to be learning Sicilian to give more passionate team talks. Nobody understands them yet.',
  ],
  british: ['🚨 {p} linked with a shock loan to a pub side. Fee: a pie and a pint.'],
  american: ['🚨 {p} reportedly asking for a trade to a team with better halftime snacks.'],
  spanish: ['🚨 {p} spotted negotiating a move in exchange for two churros. Agents deny everything.'],
};
function rumoursFor(club) {
  const id = identityOf(club);
  return id.voice === 'italian' ? [...RUMOURS.slice(2), ...VOICE_RUMOURS.italian] : [...RUMOURS, ...(VOICE_RUMOURS[id.voice] || [])];
}

const RITUALS = [
  ['🧂', 'Throw salt over your shoulder'],
  ['🧿', 'Hang the evil-eye charm'],
  ['👕', 'Wear the away kit inside out'],
];

function createFunZone({ getGuildState, saveGuildSettings, loadMatches }) {
  async function clubFor(interaction) {
    const state = await getGuildState(interaction.guildId);
    const club = resolveClub(state, interaction.member) || activeClubs(state)[0];
    return { state, club };
  }

  async function matchesFor(guildId, club) {
    return loadMatches ? await loadMatches(guildId, club.key).catch(() => []) : [];
  }

  async function saveFun(guildId, state, club, change) {
    club.fun = { quotes: [], ...(club.fun || {}) };
    change(club.fun);
    await saveGuildSettings(guildId, state);
  }

  function curseEmbed(club, streak) {
    const c = club.fun?.curse;
    const done = c?.breakers?.length || 0;
    return new EmbedBuilder()
      .setColor(0x1a1a1a)
      .setTitle(`${funVoice(club).curseEmoji} ${funVoice(club).curse.toUpperCase()} — The club is cursed`)
      .setDescription(
        `${streak} straight losses. Someone has given ${club.name || 'the club'} the evil eye.\n` +
          `Perform the rituals below to lift it before the next kick-off. **${done}/${RITUAL_TARGET}** done.`
      )
      .setFooter({ text: 'The curse breaks fully with the next win.' });
  }

  function ritualRow() {
    return new ActionRowBuilder().addComponents(
      RITUALS.map(([emoji, label], i) => new ButtonBuilder().setCustomId(`fun_rit:${i}`).setLabel(label).setEmoji(emoji).setStyle(ButtonStyle.Secondary))
    );
  }

  function funPanel(club) {
    return {
      embeds: [new EmbedBuilder().setColor(funColor(club)).setTitle(`🎉 Fun Zone — ${club.name || 'the club'}`)
        .setDescription([
          'Win or lose, keep the banter going.',
          '',
          `${funVoice(club).roast.split(' ')[0]} **Roast** — awards from the last night\'s real stats`,
          '🎙️ **Press Conference** — face the press about the last result',
          '🚨 **Rumour** — a made-up transfer exclusive about you',
          '📜 **Save Quote** · 🎧 **Random Quote** — the voice-chat archive (the Chronicle prints the best ones)',
          `${funVoice(club).curseEmoji} **Curse** — check or break the ${funVoice(club).curse}`,
        ].join('\n'))
        .setFooter({ text: 'Roasts use real stats · rumours are fiction' })],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('fun_panel:roast').setLabel('Roast').setEmoji(funVoice(club).roast.split(' ')[0]).setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('fun_panel:presser').setLabel('Press Conference').setEmoji('🎙️').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('fun_panel:rumour').setLabel('Rumour').setEmoji('🚨').setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('fun_panel:quote').setLabel('Save Quote').setEmoji('📜').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('fun_panel:quotes').setLabel('Random Quote').setEmoji('🎧').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('fun_panel:curse').setLabel('Curse').setEmoji(funVoice(club).curseEmoji).setStyle(ButtonStyle.Danger),
        ),
      ],
    };
  }

  function quoteModal() {
    return new ModalBuilder().setCustomId('fun_quote_modal').setTitle('Save a voice-chat quote').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text').setLabel('What was said').setStyle(TextInputStyle.Paragraph).setMaxLength(300).setRequired(true)),
    );
  }

  async function handleCommand(interaction, forced, overrides = {}) {
    const sub = forced || interaction.options.getSubcommand();
    const getUser = (k) => (k in overrides ? overrides[k] : interaction.options?.getUser?.(k) || null);
    const { state, club } = await clubFor(interaction);
    if (!club) return interaction.reply({ content: 'No club is set up yet — run /setup first.', flags: 64 });
    if (sub === 'panel') {
      // From a panel button (/me, the web Control Room) it shows privately unless a leader posts it
      const post = interaction.__gpProxy ? interaction.options?.getBoolean?.('post') === true : true;
      return interaction.reply({ ...funPanel(club), ...(post ? {} : { flags: 64 }) });
    }

    if (sub === 'roast') {
      await interaction.deferReply();
      const nights = toSessions(await matchesFor(interaction.guildId, club));
      const night = nights[nights.length - 1];
      if (!night) return interaction.editReply('No synced games to roast yet. Lucky you.');
      return interaction.editReply({ embeds: [roastEmbed(club, night)] });
    }

    if (sub === 'presser') {
      const answers = pressAnswersFor(club);
      const row = new ActionRowBuilder().addComponents(
        [...answers].sort(() => Math.random() - 0.5).slice(0, 3).map(([label]) =>
          new ButtonBuilder().setCustomId(`fun_press:${answers.findIndex((a) => a[0] === label)}:${interaction.user.id}`).setLabel(label).setStyle(ButtonStyle.Primary)
        )
      );
      const last = (await matchesFor(interaction.guildId, club))[0];
      const e = new EmbedBuilder()
        .setColor(funColor(club))
        .setTitle('🎙️ Post-match press conference')
        .setDescription(`**Reporter (${identityOf(club).def.outlet(identityOf(club).city)}, fictional):** ${pick(pressQuestionsFor(last))}\n\n${interaction.user} steps up to the mic…`);
      return interaction.reply({ embeds: [e], components: [row] });
    }

    if (sub === 'rumour') {
      const target = getUser('player');
      const member = target ? await interaction.guild.members.fetch(target.id).catch(() => null) : null;
      const label = member?.displayName || target?.username || interaction.member?.displayName || interaction.user.username;
      const e = new EmbedBuilder().setColor(funColor(club)).setDescription(pick(rumoursFor(club)).replace('{p}', `**${label}**`).replace('{city}', identityOf(club).city)).setFooter({ text: 'Fake news. 100% made up for banter.' });
      return interaction.reply({ embeds: [e], allowedMentions: { parse: [] } });
    }

    if (sub === 'quote') {
      const text = String(overrides.text ?? interaction.options.getString('text')).trim();
      const who = getUser('who') || interaction.user;
      await saveFun(interaction.guildId, state, club, (fun) => {
        fun.quotes = [{ text, who: who.id, by: interaction.user.id, at: new Date().toISOString() }, ...(fun.quotes || [])].slice(0, MAX_QUOTES);
      });
      return interaction.reply({ content: `📜 Archived: *"${text}"* — <@${who.id}>`, allowedMentions: { parse: [] } });
    }

    if (sub === 'quotes') {
      const quotes = club.fun?.quotes || [];
      if (!quotes.length) return interaction.reply({ content: 'The quote archive is empty. Save one with `/fun quote`.', flags: 64 });
      const q = pick(quotes);
      return interaction.reply({ content: `🎧 *"${q.text}"*\n— <@${q.who}>, ${new Date(q.at).toLocaleDateString('en-US')}`, allowedMentions: { parse: [] } });
    }

    if (sub === 'curse') {
      const matches = await matchesFor(interaction.guildId, club);
      const streak = lossStreak(matches);
      if (streak < CURSE_STREAK) {
        if (club.fun?.curse) await saveFun(interaction.guildId, state, club, (fun) => delete fun.curse);
        return interaction.reply({ content: `✨ No ${funVoice(club).curse} on the club right now. It looks elsewhere… for now.` });
      }
      if (!club.fun?.curse || club.fun.curse.since !== matches[0]?.id) {
        await saveFun(interaction.guildId, state, club, (fun) => {
          fun.curse = { since: matches[0]?.id || null, breakers: [] };
        });
      }
      return interaction.reply({ embeds: [curseEmbed(club, streak)], components: [ritualRow()] });
    }
    return null;
  }

  async function handleButton(interaction) {
    const [kind, a, owner] = interaction.customId.split(':');
    if (kind === 'fun_press') {
      if (owner && owner !== interaction.user.id) return interaction.reply({ content: 'Only the person at the mic can answer.', flags: 64 });
      const { club } = await clubFor(interaction);
      const answers = pressAnswersFor(club);
      const ans = answers[Number(a)] || answers[0];
      const old = interaction.message.embeds[0];
      const e = EmbedBuilder.from(old).setDescription(`${old.description}\n\n**${interaction.member?.displayName || interaction.user.username}:** ${ans[1]}`);
      return interaction.update({ embeds: [e], components: [] });
    }
    if (kind === 'fun_rit') {
      const { state, club } = await clubFor(interaction);
      if (!club?.fun?.curse) return interaction.reply({ content: 'The curse is already lifted. 🙏', flags: 64 });
      const breakers = club.fun.curse.breakers || [];
      if (breakers.some((b) => b.user === interaction.user.id)) return interaction.reply({ content: 'You already did your part. Let the others pitch in.', flags: 64 });
      await saveFun(interaction.guildId, state, club, (fun) => {
        fun.curse.breakers = [...breakers, { user: interaction.user.id, ritual: Number(a) }];
      });
      const done = club.fun.curse.breakers.length;
      const [emoji, label] = RITUALS[Number(a)] || RITUALS[0];
      if (done >= RITUAL_TARGET) {
        return interaction.update({
          embeds: [
            new EmbedBuilder()
              .setColor(funColor(club))
              .setTitle('🙏 The rituals are complete')
              .setDescription(`The squad did its part. The ${funVoice(club).curse} weakens — only a win will break it for good.\nLast ritual: ${emoji} ${label} by ${interaction.user}.`),
          ],
          components: [],
        });
      }
      const streak = lossStreak(await matchesFor(interaction.guildId, club));
      return interaction.update({ embeds: [curseEmbed(club, Math.max(streak, CURSE_STREAK))], components: [ritualRow()] });
    }
    return null;
  }

  async function handleInteraction(interaction) {
    if (!interaction.guildId) return false;
    if (interaction.isChatInputCommand() && interaction.commandName === 'fun') {
      await handleCommand(interaction);
      return true;
    }
    if (interaction.isButton() && interaction.customId.startsWith('fun_panel:')) {
      const sub = interaction.customId.split(':')[1];
      if (sub === 'quote') await interaction.showModal(quoteModal());
      else await handleCommand(interaction, sub, { player: null });
      return true;
    }
    if (interaction.isModalSubmit?.() && interaction.customId === 'fun_quote_modal') {
      await handleCommand(interaction, 'quote', { text: interaction.fields.getTextInputValue('text'), who: null });
      return true;
    }
    if (interaction.isButton() && /^fun_(press|rit):/.test(interaction.customId)) {
      await handleButton(interaction);
      return true;
    }
    return false;
  }

  // Session recap extras: a roast after any night with a loss, a curse notice on a 2+ loss streak,
  // and a "curse broken" line when a win follows a curse.
  async function onSessionEnd({ guildId, club, matches, allMatches }) {
    const embeds = [];
    const state = await getGuildState(guildId);
    const live = state?.clubs?.find((c) => c.key === club.key);
    if (matches.some((m) => m.result === 'loss')) {
      const awards = roastAwards(matches, club, live?.fun?.last_roast || []);
      embeds.push(roastEmbed(club, matches, awards));
      // Whoever was roasted tonight gets the next night off
      if (live && awards.length) await saveFun(guildId, state, live, (fun) => {
        fun.last_roast = awards.map((a) => a.name);
      });
    }
    const newest = [...allMatches].sort((x, y) => y.playedAt - x.playedAt);
    const streak = lossStreak(newest);
    if (live && streak >= CURSE_STREAK && !live.fun?.curse) {
      await saveFun(guildId, state, live, (fun) => {
        fun.curse = { since: newest[0]?.id || null, breakers: [] };
      });
      embeds.push(curseEmbed(live, streak).setDescription(`${streak} straight losses. The ${funVoice(live).curse} has struck. Use **/fun curse** (or the Fun Zone panel) to start the rituals.`));
    } else if (live?.fun?.curse && newest[0]?.result === 'win') {
      await saveFun(guildId, state, live, (fun) => delete fun.curse);
      embeds.push(new EmbedBuilder().setColor(funColor(live)).setTitle('🎉 CURSE BROKEN').setDescription(`A win! The ${funVoice(live).curse} has been lifted. ${funVoice(live).cheer}`));
    }
    return embeds.length ? { embeds } : null;
  }

  return { handleInteraction, onSessionEnd, funPanel };
}

module.exports = { createFunZone, FUN_COMMAND, roastAwards, lossStreak, pressQuestionsFor, pressAnswersFor, FUN_VOICE };
