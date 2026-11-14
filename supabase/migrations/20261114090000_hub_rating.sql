-- Social Hub pickup rating (public/spotbot/hub-draft.cjs): Elo from 1000, moved by captain-reported
-- results of pickup drafts and balanced teams.
ALTER TABLE public.hub_players ADD COLUMN IF NOT EXISTS rating integer NOT NULL DEFAULT 1000;
ALTER TABLE public.hub_players ADD COLUMN IF NOT EXISTS rated_games integer NOT NULL DEFAULT 0;
