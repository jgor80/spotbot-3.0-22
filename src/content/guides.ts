// Public, keyword-targeted pages (gafferbot.app/<slug>) that people find from Google and that AI answer
// engines (ChatGPT, Perplexity, Google AI Overviews, Claude) can quote. Each page leads with a plain
// answer, then sections, then its own FAQ. scripts/prerender.mjs renders every page to static HTML and
// writes /llms.txt and /llms-full.txt from this file, so keep it free of browser-only code.
//
// Inline text supports **bold** and [links](/path). Keep claims in step with the app: the Discord
// guides in public/spotbot/hub-guides.cjs are the source of truth for button and panel names.

export const THE_SPOT_PATH = "/play/the-spot-fc-27-pickup-drafts-cups";
export const GUIDES_UPDATED = "2026-11-14";

export interface GuideSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  steps?: { title: string; body: string }[];
}

export interface Guide {
  slug: string;
  /** <title>: the main search phrase first */
  title: string;
  /** Meta description (about 150 characters) */
  description: string;
  h1: string;
  kicker: string;
  /** The direct answer, first thing on the page: what search snippets and AI engines quote */
  answer: string;
  sections: GuideSection[];
  faq: { q: string; a: string }[];
  related: string[];
  /** Marks the page's steps section as a HowTo in structured data */
  howTo?: boolean;
  /** Short label for nav and link lists */
  label: string;
}

const ADD = "Add GafferBot to your server from [gafferbot.app](/), run **/setup**, then link your EA club with **/manager → Admin → Link EA Club**.";

export const GUIDES: Guide[] = [
  {
    slug: "pro-clubs-discord-bot",
    label: "Pro Clubs Discord bot",
    title: "Pro Clubs Discord Bot for EA SPORTS FC 27 | GafferBot",
    description:
      "GafferBot is a free EA FC 27 Pro Clubs Discord bot: availability, lineups, EA stats sync, recruiting, free agents and match night tools in one /manager panel.",
    h1: "The Pro Clubs Discord bot for EA SPORTS FC 27",
    kicker: "Pro Clubs Discord bot",
    answer:
      "GafferBot is a free Discord bot built for EA SPORTS FC 27 Pro Clubs. It runs a club from one **/manager** panel: players answer games with Yes, Maybe or No, managers post lineups as a team graphic, results and player ratings sync from EA after every match, and recruiting finds free agents from every GafferBot server. Every feature is free.",
    sections: [
      {
        heading: "What a Pro Clubs bot needs to do",
        paragraphs: [
          "A Pro Clubs side lives in Discord, but Discord on its own doesn't know who is free on Thursday, who plays CDM or how the last ten games went. Managers end up chasing replies, drawing lineups in Paint and copying stats out of the game. GafferBot does those jobs for you and keeps them in one place.",
        ],
        bullets: [
          "**Availability:** post a league game, friendly or BYOT and players tap Available, Maybe or Unavailable. Anyone who hasn't answered gets a DM reminder. See [availability and match night](/pro-clubs-availability-bot).",
          "**Lineups and team sheets:** drag players into any of the 28 FC 27 formations and post a clean graphic in your club colours, or let auto lineups pick the XI. See the [lineup bot](/pro-clubs-lineup-bot).",
          "**Stats from EA:** link your club once and results, ratings, form and division progress update on their own, with a recap after every game. See the [stats tracker](/pro-clubs-stats-tracker).",
          "**Recruiting:** a cross-server free agent pool, recruiting posters, trials and report cards. See [recruiting and free agents](/pro-clubs-recruiting).",
          "**The GafferBot Network:** opt in to find a last-minute sub, book friendlies with clubs your level and enter GafferBot BYOTs.",
          "**Club life:** a match report and newspaper, awards, badges, belts, Club Wrapped and player cards in your colours.",
        ],
      },
      {
        heading: "Four commands, buttons for everything else",
        paragraphs: [
          "Players never have to learn commands. **/manager** is the manager hub, **/me** is each player's own hub (stats, events, positions, EA link, free agent profile), **/setup** is a checklist of what to do next and **/help** is a quick tour. Every Discord panel also works on the website at gafferbot.app, signed in with Discord, with the same permissions.",
        ],
      },
      {
        heading: "Built for real clubs",
        bullets: [
          "Run more than one club in a server: each keeps its own roster, events, stats and colours.",
          "League games ping only your signed players role, never everyone, and the bot never pings players one by one.",
          "Club colours, crest and kits on every post and graphic.",
          "Works with ChatGPT and Claude as an AI connector, so managers can ask about stats or build a lineup in plain English.",
        ],
      },
      {
        heading: "Get started in two minutes",
        paragraphs: [ADD, "Then post your first game from **/manager → Events**. The step by step version is in [how to set up a Pro Clubs Discord server](/how-to-set-up-a-pro-clubs-discord-server)."],
      },
    ],
    faq: [
      { q: "What is the best Discord bot for Pro Clubs?", a: "GafferBot is built only for EA SPORTS FC Pro Clubs. It covers availability, lineups, EA stats sync, recruiting and match night in one panel, and it is free. General event bots can take sign-ups, but they don't know positions, formations or your EA club." },
      { q: "Is GafferBot free?", a: "Yes. Every feature is free for every server. The only paid extra is AI-generated images: each server gets a free allowance, then can buy optional image packs." },
      { q: "Does GafferBot work for FC 27?", a: "Yes. It reads FC 27 Pro Clubs results from EA, uses all 28 FC 27 formations in the lineup builder and tracks FC 27 divisions." },
      { q: "Does it work on PlayStation, Xbox and PC?", a: "Yes. GafferBot runs in Discord and on the web, and links EA clubs on PS5, Xbox Series X|S and PC. Free agents list their platform so you can filter by it." },
      { q: "Is GafferBot made by EA?", a: "No. GafferBot is an independent project and isn't made, endorsed or sponsored by Electronic Arts or Discord." },
    ],
    related: ["pro-clubs-lineup-bot", "pro-clubs-stats-tracker", "how-to-set-up-a-pro-clubs-discord-server", "pro-clubs-pickup-games"],
  },
  {
    slug: "pro-clubs-lineup-bot",
    label: "Lineup and team sheet bot",
    title: "FC 27 Pro Clubs Lineup Builder and Team Sheet Bot | GafferBot",
    description:
      "Build EA FC 27 Pro Clubs lineups by drag and drop in all 28 formations, auto-pick the XI from who's available and post a team sheet graphic to Discord. Free.",
    h1: "FC 27 Pro Clubs lineups and team sheets, posted to Discord",
    kicker: "Lineup builder",
    answer:
      "GafferBot's lineup builder lets a Pro Clubs manager drag available players onto the pitch and bench in any of the 28 EA FC 27 formations, pick a kit, and post a team sheet graphic to Discord in the club's colours. Auto lineups can fill the XI from who said yes, their positions and their form, and you can change anything before posting.",
    sections: [
      {
        heading: "How the lineup builder works",
        steps: [
          { title: "Post the game", body: "Post a league game or friendly from /manager → Events. Players answer Available, Maybe or Unavailable." },
          { title: "Open the builder", body: "Press Edit Lineup in Discord, or open gafferbot.app/lineup. Only players who said yes are offered first." },
          { title: "Pick the formation", body: "Choose any of the 28 FC 27 formations, then drag players onto the pitch and the bench." },
          { title: "Post it", body: "Post a clean team graphic, with player cards if your players uploaded photos, to your match channel." },
        ],
      },
      {
        heading: "Auto lineups",
        paragraphs: [
          "Short on time? Auto lineups fill the sheet from who is available, each player's first, second and third positions and recent form. You see the result before it posts and can swap anyone. Auto lineups also work from the AI connector, so a manager can ask ChatGPT or Claude to \"build a lineup for Friday from who's available\".",
        ],
      },
      {
        heading: "Team sheets, depth charts and spots",
        bullets: [
          "**Team Sheet** and **Depth Chart:** who starts where, with backups for every position.",
          "**Spots board:** a live board of open positions that fills as players take spots, including from a voice channel.",
          "**Positions:** players set their positions in /me → My Positions, or the bot reads them from position roles.",
          "**Club colours and kits:** set once on the website and every lineup graphic uses them.",
        ],
      },
    ],
    faq: [
      { q: "How do I post a Pro Clubs lineup in Discord?", a: "With GafferBot, press Edit Lineup on the game in Discord (or open gafferbot.app/lineup), drag players into a formation and press post. The bot posts a team graphic to your match channel." },
      { q: "Does the lineup builder have every FC 27 formation?", a: "Yes, all 28 FC 27 formations, including 4-1-2-1-2, 4-2-3-1, 3-5-2 and 5-2-3." },
      { q: "Can the bot pick the lineup for me?", a: "Yes. Auto lineups use who said yes, their preferred positions and recent form. You can edit the result before posting." },
      { q: "Can players see their position before kick-off?", a: "Yes. The posted lineup shows every player's position, and players can check events and their positions in /me." },
    ],
    related: ["pro-clubs-availability-bot", "pro-clubs-discord-bot", "pro-clubs-stats-tracker"],
  },
  {
    slug: "pro-clubs-availability-bot",
    label: "Availability and match night",
    title: "Pro Clubs Availability Bot: Sign-ups, Reminders and Subs | GafferBot",
    description:
      "Stop chasing replies. Post a Pro Clubs game in Discord, players tap Available, Maybe or Unavailable, reminders go out by DM and the bot finds subs. Free.",
    h1: "Pro Clubs availability, check-ins and subs without the chasing",
    kicker: "Availability and match night",
    answer:
      "GafferBot posts each Pro Clubs game in Discord as a board with Available, Maybe and Unavailable buttons, DMs a reminder to anyone who hasn't answered, runs a check-in on the night and asks the server or the GafferBot Network for a sub when someone drops out. Repeating events post your whole week on their own.",
    sections: [
      {
        heading: "Events that answer themselves",
        bullets: [
          "**League Game, Friendly, BYOT / Tournament** or a custom event, each posted as a board with answer buttons.",
          "**Signed players only for league games:** league nights ping your signed players role, other events ping @everyone or a role you choose.",
          "**Reminders by DM** to anyone who hasn't answered, and before kick-off to everyone who said yes.",
          "**Presets and Repeating Events** save your usual nights so the week posts itself.",
          "**Time zones:** set the club's time zone; everyone sees kick-off in their own.",
        ],
      },
      {
        heading: "Match night",
        bullets: [
          "**Open Check-in:** players press Check In when they're on.",
          "**Find a Sub:** asks your server, or other servers on the GafferBot Network, for cover.",
          "**Reliability and Attendance:** see who shows up, game after game.",
          "**Autopilot:** reminders, check-ins and recaps run on their own.",
          "**Drafts and casual nights:** captains pick teams from voice for in-house games, and Smalls Night runs small-sided games.",
        ],
      },
    ],
    faq: [
      { q: "How do I get my Pro Clubs team to say if they can play?", a: "Post the game with GafferBot (/manager → Events). Players tap Available, Maybe or Unavailable, and the bot DMs a reminder to anyone who hasn't answered." },
      { q: "Can the bot find a sub when someone drops out?", a: "Yes. Find a Sub asks your own server, and if you have opted in to the GafferBot Network, Need a Player asks other servers for a replacement." },
      { q: "Will it spam everyone with pings?", a: "No. League games ping only your signed players role, other events ping the role you choose, and the bot never pings players one by one." },
    ],
    related: ["pro-clubs-lineup-bot", "pro-clubs-discord-bot", "pro-clubs-pickup-games"],
  },
  {
    slug: "pro-clubs-stats-tracker",
    label: "Stats tracker",
    title: "EA FC 27 Pro Clubs Stats Tracker in Discord | GafferBot",
    description:
      "Track EA FC 27 Pro Clubs stats in Discord: results, player ratings, form, division progress and match recaps sync from EA on their own. Free.",
    h1: "EA FC 27 Pro Clubs stats, tracked for you",
    kicker: "Stats tracker",
    answer:
      "Once a club is linked, GafferBot reads its EA SPORTS FC 27 Pro Clubs games from EA after each match. Results, player ratings, goals, assists, form and division progress update on their own, a recap posts in Discord, and insights show who plays well together, which nights you win and which positions work.",
    sections: [
      {
        heading: "What gets tracked",
        bullets: [
          "**Results and recaps:** every match, with a recap and player of the match in your results channel.",
          "**Player stats and ratings:** per game and over time, with a club leaderboard.",
          "**Form and division progress:** where you are this season and whether you're heading up or down.",
          "**Insights:** partnerships that win, your best nights and positions, and chemistry between players.",
          "**Scouting:** scout any other club and get a match preview before you play them.",
        ],
      },
      {
        heading: "Where the numbers come from",
        paragraphs: [
          "Stats come from EA's public Pro Clubs data for your club. Some numbers, like hidden stats and chemistry, are GafferBot's own estimates and are labelled that way. EA only keeps recent games, so link your club early; players link their gamertag in **/me → Link EA** so their stats find them.",
          "The same data is in Discord (/manager → Stats & Scouting, /me → My Stats) and on the website at gafferbot.app with more room: insights, games, ratings, scouting and the leaderboard.",
        ],
      },
    ],
    faq: [
      { q: "How do I see Pro Clubs stats for my club?", a: "Add GafferBot to your Discord and link your club in /manager → Admin → Link EA Club. Results and player stats then sync from EA after every game." },
      { q: "Why are some games missing?", a: "EA only keeps a club's recent games. Check the club is linked in the EA Panel, ask players to link their gamertag in /me, and press Sync Matches." },
      { q: "Can I scout another Pro Clubs team?", a: "Yes. Scout a Club and Match Preview look up any club's recent results and players before you play them." },
    ],
    related: ["pro-clubs-discord-bot", "pro-clubs-lineup-bot", "pro-clubs-recruiting"],
  },
  {
    slug: "pro-clubs-recruiting",
    label: "Recruiting and free agents",
    title: "Find Pro Clubs Players and Free Agents for FC 27 | GafferBot",
    description:
      "Recruit for your EA FC 27 Pro Clubs team: search free agents by position and platform across every GafferBot server, post recruiting graphics and run trials.",
    h1: "Find Pro Clubs players and free agents",
    kicker: "Recruiting",
    answer:
      "GafferBot gives Pro Clubs managers a free agent pool drawn from every GafferBot server, searchable by position and platform, plus recruiting posters with an apply button, trials with a report card on every trialist, and a Squad Gaps view of the positions you are short in. Players looking for a club join the pool from /me → Free Agent.",
    sections: [
      {
        heading: "For managers",
        bullets: [
          "**Search Free Agents** by position and platform and reach out through the bot.",
          "**Squad Gaps** shows which positions you're short in.",
          "**Recruitment Poster** and **Apply Button** advertise open spots with a graphic in your colours.",
          "**Trials:** after a trial you get a report card with Promote, Second trial or Release.",
          "**Watchlist** and **Opponent Dossier** keep tabs on players and rivals.",
        ],
      },
      {
        heading: "For players looking for a club",
        paragraphs: [
          "Run **/me → Free Agent** in any server with GafferBot to join the pool with your positions, platform and time zone. **Resume Card** makes a shareable card of your record. If you just want a game tonight, join a Social Hub like [The Spot](" + THE_SPOT_PATH + ") and press Play now; see [Pro Clubs pickup games](/pro-clubs-pickup-games).",
        ],
      },
    ],
    faq: [
      { q: "Where can I find Pro Clubs players?", a: "In GafferBot's free agent pool, which covers every server that uses the bot, searchable by position and platform. You can also post a recruiting poster or find players in a Social Hub like The Spot." },
      { q: "How do I find a Pro Clubs team as a player?", a: "Run /me → Free Agent in any GafferBot server to list yourself, or join The Spot, play drop-in games and use Find a team, which ranks teams by your chemistry with their players." },
    ],
    related: ["pro-clubs-pickup-games", "pro-clubs-discord-bot", "pro-clubs-stats-tracker"],
  },
  {
    slug: "pro-clubs-pickup-games",
    label: "Pickup games (The Spot)",
    title: "Pro Clubs Pickup Games and Drop-in Discord Server for FC 27 | GafferBot",
    description:
      "Find EA FC 27 Pro Clubs pickup games any time. The Spot is an open Discord server with live drop-in lobbies, pickup drafts, a weekly cup and teams to join.",
    h1: "Pro Clubs pickup games, any time",
    kicker: "Pickup games and drop-in lobbies",
    answer:
      "The Spot is GafferBot's open Discord server for EA FC 27 Pro Clubs pickup games. A live board shows every lobby and the positions it needs; press **Play now** and the bot puts you in the lobby that needs your position, or calls a game when enough people are on. There are no trials or sign-ups, plus pickup drafts, a weekly tournament, XP and badges, and teams you can join or start.",
    sections: [
      {
        heading: "How drop-in games work",
        steps: [
          { title: "Join The Spot", body: "Open the public page and press Join and play to get the Discord invite." },
          { title: "Press Play now", body: "On the #whos-playing board. GafferBot finds the lobby that needs your position, or queues you until enough are on." },
          { title: "Play and level up", body: "Every game, win and hour in the lobbies earns XP, weekly challenges and badges." },
          { title: "Find your people", body: "Chemistry shows who you play well with. Find a team, or start one with its own role and channels." },
        ],
      },
      {
        heading: "More than pickup",
        bullets: [
          "**Pickup drafts** and **Balanced teams** for in-house games.",
          "**Tournament:** a weekly pickup tournament with random teams.",
          "**Hub League:** friendlies, a weekly-round league and a knockout cup between hub teams.",
          "**Competitions:** outside leagues and BYOTs that hub teams enter together.",
          "**Highlights:** post clips for Highlight of the Week.",
        ],
      },
      {
        heading: "Run your own hub",
        paragraphs: [
          "Any server with GafferBot can become a Social Hub: a server admin presses **/manager → Casual Play → Set Up Social Hub**. Hubs can opt in to a public page on gafferbot.app/play so new players can find them.",
        ],
      },
    ],
    faq: [
      { q: "Where can I find Pro Clubs pickup games?", a: "Join The Spot, GafferBot's open Pro Clubs Discord server. Press Play now on the live board and the bot puts you in a lobby that needs your position." },
      { q: "Is there a Pro Clubs Discord server for solo players?", a: "Yes. The Spot is open to everyone with no trials. Solo players drop into lobbies, play pickup drafts and the weekly tournament, and can find or start a team from there." },
      { q: "Do I need a team to play?", a: "No. Lobbies are drop-in. When you find players you click with, you can start a team in the hub and enter the Hub League or outside competitions." },
    ],
    related: ["pro-clubs-recruiting", "pro-clubs-discord-bot", "pro-clubs-availability-bot"],
  },
  {
    slug: "how-to-set-up-a-pro-clubs-discord-server",
    label: "Set up a Pro Clubs Discord",
    howTo: true,
    title: "How to Set Up a Pro Clubs Discord Server (FC 27 Guide) | GafferBot",
    description:
      "Step by step: set up a Discord server for your EA FC 27 Pro Clubs team with channels, roles, availability, lineups and EA stats in about two minutes.",
    h1: "How to set up a Pro Clubs Discord server",
    kicker: "Setup guide",
    answer:
      "To set up a Discord server for an EA FC 27 Pro Clubs team: create the server and a few channels (announcements, match night, lineups, results), add GafferBot, run /setup, link your EA club, set your colours and crest, name your captains and post a Player Hub so players can set their positions. The bot then handles availability, lineups and stats.",
    sections: [
      {
        heading: "Step by step",
        steps: [
          { title: "Create the server and channels", body: "Make channels for announcements, match night (games and availability), lineups and results. One channel can do several jobs in a small club." },
          { title: "Add GafferBot", body: "Press Add to Discord on gafferbot.app. You need Manage Server in the Discord server." },
          { title: "Run /setup", body: "It lists what to do next and any permission the bot is missing in your channels." },
          { title: "Link your EA club", body: "Go to /manager → Admin → Link EA Club and pick your club and platform. Results and stats sync from then on." },
          { title: "Add colours, crest and kits", body: "Sign in at gafferbot.app with Discord and set them in Settings. Every post and graphic uses them." },
          { title: "Name your staff and signed role", body: "In /manager → Roster & Squad, set captains and managers and the Signed Players Role, so league games only ping signed players." },
          { title: "Post the Player Hub", body: "/manager → Admin → Post Player Hub gives everyone the /me buttons to set positions and link their gamertag." },
          { title: "Post your first game", body: "/manager → Events. Availability, the lineup, reminders and the recap take care of themselves." },
        ],
      },
      {
        heading: "Roles worth making",
        bullets: [
          "**Signed players:** the squad registered for league games. League games ping only this role.",
          "**Captain / manager:** people who run club actions. Server admins can always run them too.",
          "**Position roles (optional):** GafferBot can read players' positions from them with Prefs From Roles.",
          "Keep the GafferBot role above any roles it gives out, so it can move trophies and positions.",
        ],
      },
      {
        heading: "Common problems",
        bullets: [
          "**The bot doesn't post in a channel:** run /setup and pick that channel; it names the missing permission.",
          "**Buttons say you can't do that:** ask an admin to add you as a manager.",
          "**Stats missing:** check the EA Panel, ask players to link their gamertag and press Sync Matches.",
        ],
      },
    ],
    faq: [
      { q: "What channels does a Pro Clubs Discord need?", a: "At least announcements, match night (for games and availability), lineups and results. GafferBot posts each kind of message in the channel you choose." },
      { q: "How long does setup take?", a: "About two minutes to add GafferBot, run /setup and link your EA club. Colours, crest and staff take a few more." },
      { q: "Can one Discord server run several Pro Clubs teams?", a: "Yes. Each club keeps its own roster, events, stats and colours, and you pick which club you're working on at the top of the panels." },
    ],
    related: ["pro-clubs-discord-bot", "pro-clubs-availability-bot", "pro-clubs-lineup-bot"],
  },
];

// The home page FAQ (also first on /faq)
export const HOME_FAQ = [
  {
    q: "What is GafferBot?",
    a: "GafferBot is a free Discord bot and website for EA SPORTS FC 27 Pro Clubs. It handles availability, lineups, EA stats, recruiting and match night for clubs, and runs The Spot, an open server for drop-in Pro Clubs games.",
  },
  {
    q: "Do my players need an account?",
    a: "No. Players use buttons in Discord. They can sign in here with Discord if they want their own profile and stats on the web, but it's optional.",
  },
  {
    q: "Where do the stats come from?",
    a: "EA's public Pro Clubs data for your club. Link your club once in /setup and new matches sync on their own. Some numbers, like hidden stats and chemistry, are GafferBot's estimates and are labelled that way.",
  },
  {
    q: "Can I run more than one club in a server?",
    a: "Yes. Each club keeps its own roster, events, stats and colours, and players are matched by the club name in their roles.",
  },
  {
    q: "What does it cost?",
    a: "GafferBot is free: every feature, every server. AI images cost us money to make, so each server gets 20 free AI images to start and 10 more free every month. Need more? Buy an image pack (25 for $4.99 or 70 for $12.99) on the website or in Discord's store. Lineups, stats and the other graphics stay free.",
  },
  {
    q: "Where can I find a Pro Clubs game right now?",
    a: "Join The Spot, GafferBot's open Pro Clubs Discord server. Press Play now on the live board and the bot puts you in a lobby that needs your position. No trials or sign-ups.",
  },
  {
    q: "Is this made by EA?",
    a: "No. GafferBot is an independent project and isn't made, endorsed or sponsored by Electronic Arts or Discord.",
  },
];

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug);

// The site-wide FAQ page (/faq): the home page questions plus every guide's, without repeats
export function allFaq(home: { q: string; a: string }[]) {
  const seen = new Set<string>();
  return [...home, ...GUIDES.flatMap((g) => g.faq)].filter((f) => (seen.has(f.q) ? false : (seen.add(f.q), true)));
}

/** **bold** and [text](href) to plain text, for meta tags, JSON-LD and llms.txt */
export const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
