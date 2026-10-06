// Premium: the virtual assistant coach. After a session (autopilot's voice-bounded session recap)
// or on demand with /premium coach, it turns synced EA matches into a short debrief:
//   chemistry   team pass completion and results with two players on together vs. apart
//   fatigue     late games of a night (4th onwards) vs. early ones, tonight and across past nights
//   form        who carried the night, who faded from the first games to the last
// The findings are computed here; the AI (OpenAI, the same setup /scoutclub uses) only rewrites
// them in a coach's voice and is told not to add numbers. Without OPENAI_API_KEY the findings are
// posted as plain bullets. EA has no event times, so "late" means later games, not later minutes.

const { EmbedBuilder } = require('discord.js');
const { activeClubs, resolveClub } = require('./manager-hub.cjs');
const { seasonTotals, num, LEAVER_RATING } = require('./player-season.cjs');

const SESSION_GAP_MS = 90 * 60 * 1000;
const HISTORY_MATCHES = 120;
const MIN_TOGETHER = 3;
const MIN_APART = 3;
const PASS_GAP = 8; // percentage points before a pairing is worth mentioning
const LATE_GAME = 4; // games from this one on count as "late in the night"
const MIN_SESSIONS = 3;
const FADE = 1.0; // rating drop from first to last games of the night

const COACH_SUBCOMMAND = {
  type: 1,
  name: 'coach',
  description: "The assistant coach's debrief on your latest session.",
  options: [{ name: 'club', description: 'Club name (if the server has more than one).', type: 3, required: false }],
};

const COACH_PROMPT = `You are the assistant coach of an EA FC Pro Clubs team, talking to your manager after tonight's games.
You get a list of findings computed from EA match data. Rewrite them as a short debrief:
- Start with: "Boss, here's what the data says from tonight's N games:" (use the real N).
- One bullet per finding, at most 6 bullets, each 1-2 sentences, ending with a concrete suggestion where it makes sense.
- Use only the numbers and names in the findings. Never invent stats, minutes, formations or events.
- Plain, direct football language. No headings, no sign-off.`;

function passPct(m) {
  let made = 0;
  let att = 0;
  for (const p of m.players || []) {
    made += num(p.passes_made);
    att += num(p.pass_attempts);
  }
  return att ? (100 * made) / att : null;
}

function names(m) {
  return new Set((m.players || []).map((p) => String(p.ea_username || '').trim()).filter(Boolean));
}

// Group matches (any order) into nights: a gap of 90+ minutes starts a new session. Oldest first.
function toSessions(matches) {
  const sorted = [...matches].sort((a, b) => a.playedAt - b.playedAt);
  const out = [];
  for (const m of sorted) {
    const cur = out[out.length - 1];
    if (cur && m.playedAt - cur[cur.length - 1].playedAt < SESSION_GAP_MS) cur.push(m);
    else out.push([m]);
  }
  return out;
}

const avg = (list) => (list.length ? list.reduce((s, x) => s + x, 0) / list.length : null);
const f1 = (x) => x.toFixed(1);

// Pure: findings for a session. session = tonight's matches; history = earlier matches (any order).
function coachFindings(session, history) {
  const findings = [];
  const tonight = [...session].sort((a, b) => a.playedAt - b.playedAt);
  const all = [...history, ...tonight];
  const n = tonight.length;
  const wins = tonight.filter((m) => m.result === 'win').length;
  const draws = tonight.filter((m) => m.result === 'draw').length;
  findings.push({
    kind: 'summary',
    text: `${n} games tonight: ${wins}W ${draws}D ${n - wins - draws}L, ${tonight.reduce((s, m) => s + m.scoreFor, 0)} scored, ${tonight.reduce((s, m) => s + m.scoreAgainst, 0)} conceded.`,
  });

  // Chemistry: pairs that both played tonight, measured over all tracked matches
  const tonightNames = [...new Set(tonight.flatMap((m) => [...names(m)]))];
  const pairs = [];
  for (let i = 0; i < tonightNames.length; i++) {
    for (let j = i + 1; j < tonightNames.length; j++) {
      const a = tonightNames[i];
      const b = tonightNames[j];
      const together = [];
      const apart = [];
      for (const m of all) {
        const s = names(m);
        if (s.has(a) && s.has(b)) together.push(m);
        else if (s.has(a) !== s.has(b)) apart.push(m);
      }
      if (together.length < MIN_TOGETHER || apart.length < MIN_APART) continue;
      const pt = avg(together.map(passPct).filter((x) => x != null));
      const pa = avg(apart.map(passPct).filter((x) => x != null));
      const wt = (100 * together.filter((m) => m.result === 'win').length) / together.length;
      const wa = (100 * apart.filter((m) => m.result === 'win').length) / apart.length;
      if (pt == null || pa == null) continue;
      pairs.push({ a, b, pt, pa, wt, wa, together: together.length, apart: apart.length });
    }
  }
  const clash = pairs.filter((p) => p.pt - p.pa <= -PASS_GAP).sort((x, y) => x.pt - x.pa - (y.pt - y.pa))[0];
  if (clash) {
    findings.push({
      kind: 'chemistry-warning',
      text: `Chemistry warning: with ${clash.a} and ${clash.b} on together, team pass completion is ${Math.round(clash.pt)}% vs ${Math.round(clash.pa)}% when only one of them plays (${clash.together} games together, ${clash.apart} apart). Win rate ${Math.round(clash.wt)}% together vs ${Math.round(clash.wa)}% apart.`,
    });
  }
  const click = pairs.filter((p) => p !== clash && p.wt - p.wa >= 15 && p.pt >= p.pa).sort((x, y) => y.wt - y.wa - (x.wt - x.wa))[0];
  if (click) {
    findings.push({
      kind: 'chemistry-good',
      text: `${click.a} and ${click.b} click: ${Math.round(click.wt)}% wins together vs ${Math.round(click.wa)}% apart (${click.together} games together).`,
    });
  }

  // Fatigue tonight: goals conceded in the late games vs the early ones
  if (n >= LATE_GAME) {
    const early = tonight.slice(0, LATE_GAME - 1);
    const late = tonight.slice(LATE_GAME - 1);
    const ga = (list) => list.reduce((s, m) => s + m.scoreAgainst, 0);
    const total = ga(tonight);
    if (total >= 3 && ga(late) / late.length > ga(early) / early.length) {
      findings.push({
        kind: 'fatigue-tonight',
        text: `Fatigue factor: ${ga(late)} of tonight's ${total} goals conceded came in games ${LATE_GAME}-${n} (${f1(ga(late) / late.length)} a game vs ${f1(ga(early) / early.length)} in games 1-${LATE_GAME - 1}). Rotate earlier or bring fresh legs in for the late games.`,
      });
    }
  }

  // Fatigue over past nights: same comparison across every session with 4+ games
  const nights = toSessions(all).filter((s) => s.length >= LATE_GAME);
  if (nights.length >= MIN_SESSIONS) {
    const early = nights.flatMap((s) => s.slice(0, LATE_GAME - 1));
    const late = nights.flatMap((s) => s.slice(LATE_GAME - 1));
    const winPct = (list) => (100 * list.filter((m) => m.result === 'win').length) / list.length;
    const gaPer = (list) => list.reduce((s, m) => s + m.scoreAgainst, 0) / list.length;
    if (winPct(early) - winPct(late) >= 15 || gaPer(late) - gaPer(early) >= 0.75) {
      findings.push({
        kind: 'fatigue-trend',
        text: `Across ${nights.length} long nights, games ${LATE_GAME}+ go ${Math.round(winPct(late))}% wins with ${f1(gaPer(late))} conceded a game, vs ${Math.round(winPct(early))}% and ${f1(gaPer(early))} in games 1-${LATE_GAME - 1}. Consider capping the session or rotating.`,
      });
    }
  }

  // Form: best tonight, and anyone who faded through the night
  const totals = [...seasonTotals(tonight).values()].filter((t) => t.rated >= Math.min(2, n));
  const best = [...totals].sort((a, b) => b.avgRating - a.avgRating)[0];
  if (best)
    findings.push({
      kind: 'star',
      text: `Player of the night: ${best.name}, ${f1(best.avgRating)} average over ${best.games} games${best.goals ? `, ${best.goals} goals` : ''}${best.assists ? `, ${best.assists} assists` : ''}.`,
    });
  if (n >= 4) {
    const half = Math.floor(n / 2);
    for (const t of totals) {
      const ratingIn = (list) =>
        avg(
          list.flatMap((m) =>
            (m.players || []).filter((p) => String(p.ea_username || '').trim() === t.name && num(p.rating) > LEAVER_RATING).map((p) => num(p.rating)),
          ),
        );
      const first = ratingIn(tonight.slice(0, half));
      const last = ratingIn(tonight.slice(half));
      if (first != null && last != null && first - last >= FADE) {
        findings.push({
          kind: 'fade',
          text: `${t.name} faded: ${f1(first)} average in the first ${half} games, ${f1(last)} after. Worth resting earlier next time.`,
        });
        break;
      }
    }
  }

  // Players who left matches early (EA rates leavers 3.0)
  const leavers = tonight.flatMap((m) =>
    (m.players || []).filter((p) => num(p.rating) > 0 && num(p.rating) <= LEAVER_RATING).map((p) => String(p.ea_username || '').trim()),
  );
  if (leavers.length) {
    const counts = [...leavers.reduce((acc, x) => acc.set(x, (acc.get(x) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]);
    findings.push({
      kind: 'leavers',
      text: `${leavers.length} early exit${leavers.length === 1 ? '' : 's'} tonight (EA's 3.0 rating): ${counts.map(([x, c]) => (c > 1 ? `${x} ×${c}` : x)).join(', ')}.`,
    });
  }
  return findings;
}

function createCoach(deps) {
  const { premium, events, autopilot, getGuildState, loadMatches, openai } = deps;

  async function phrase(findings, n) {
    const bullets = findings.map((f) => `- ${f.text}`).join('\n');
    if (!openai) return `Boss, here's what the data says from tonight's ${n} game${n === 1 ? '' : 's'}:\n${findings.map((f) => `• ${f.text}`).join('\n')}`;
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 600,
        messages: [
          { role: 'system', content: COACH_PROMPT },
          { role: 'user', content: `Games tonight: ${n}\nFindings:\n${bullets}` },
        ],
      });
      const text = res.choices?.[0]?.message?.content?.trim();
      if (text) return text;
    } catch (err) {
      console.warn(`[coach] AI phrasing failed: ${err.message}`);
    }
    return `Boss, here's what the data says from tonight's ${n} games:\n${findings.map((f) => `• ${f.text}`).join('\n')}`;
  }

  async function debrief(guildId, club, session, history) {
    const findings = coachFindings(session, history);
    const prefs = await events.serverPrefs(guildId);
    const text = await phrase(findings, session.length);
    return new EmbedBuilder()
      .setTitle(`🧠 Assistant coach · ${club.name}`)
      .setColor(Number(prefs.branding?.color) || 0x8b5cf6)
      .setDescription(text.slice(0, 4000))
      .setFooter({ text: `From ${session.length + history.length} synced EA matches. "Late" means later games of the night; EA has no match minutes.` });
  }

  // Added to autopilot's session recap on premium servers
  async function onSessionEnd({ guildId, club, matches, allMatches }) {
    if (!autopilot.isOn(club, 'coach') || !(await premium.isPremium(guildId))) return null;
    const ids = new Set(matches.map((m) => m.id));
    const history = allMatches.filter((m) => !ids.has(m.id)).slice(0, HISTORY_MATCHES);
    return { embeds: [await debrief(guildId, club, matches, history)] };
  }

  async function handleCoach(interaction) {
    await interaction.deferReply({ flags: 64 });
    if (!(await premium.gate(interaction, 'The assistant coach'))) return;
    const state = await getGuildState(interaction.guildId);
    const wanted = (interaction.options.getString('club') || '').trim().toLowerCase();
    const club =
      (wanted && activeClubs(state).find((c) => c.key === wanted || (c.name || '').toLowerCase() === wanted)) || resolveClub(state, interaction.member);
    if (!club) return interaction.editReply({ content: '❌ No club is set up yet. Run **/manager → Admin → Link EA Club** first.' });
    const matches = loadMatches ? await loadMatches(interaction.guildId, club.key).catch(() => []) : [];
    const nights = toSessions(matches);
    const latest = nights[nights.length - 1];
    if (!latest) return interaction.editReply({ content: 'No synced matches yet. Play a session and sync it first.' });
    const ids = new Set(latest.map((m) => m.id));
    const history = matches.filter((m) => !ids.has(m.id)).slice(0, HISTORY_MATCHES);
    return interaction.editReply({ embeds: [await debrief(interaction.guildId, club, latest, history)] });
  }

  async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand() || !interaction.guildId || interaction.commandName !== 'premium') return false;
    if (interaction.options.getSubcommand(false) !== 'coach') return false;
    await handleCoach(interaction);
    return true;
  }

  autopilot.onSessionEnd(onSessionEnd);

  return { handleInteraction, debrief };
}

module.exports = { createCoach, COACH_SUBCOMMAND, coachFindings, toSessions };
