- Discord auto-linking (server join, voice join, recap "I'm <gamertag>" buttons) lives in `public/spotbot/auto-link.cjs`; profiles are global so a link in one server applies everywhere.
- Scouting stats split current EA FC season vs older seasons in `recruitment.statsFor`; season start comes from `FC_SEASON_START` env so a new game needs no code change.
- Players holding a position role are auto-added to the club roster (`roster.syncMemberPositions`, on role change and at startup); multi-club servers match by club name in a role, clubs opt out with `auto_roster: false`.
- Both the cloud sync (sync-ea-stats) and the bot relink pre-FC27 clubs by exact EA name and mark them ea_fc_version='fc27'; FC27 gave every club a new ID, so old IDs only return last season's matches.
- Bot database access goes through the `bot-proxy` function with a shared BOT_PROXY_SECRET; the admin key never leaves the backend.

- Recap action artwork is bundled in the bot assets and selected by the spotlight player’s position; it is labelled as AI art because EA stats and Discord avatars do not establish a player’s likeness.
- Recap cards display actual single-match ratings, not derived overall ratings, so match performance cannot be mistaken for EA player attributes.
- Event announcement mentions are enabled only in postEvent; board updates and reposts suppress mentions so availability changes never notify the whole server again.
