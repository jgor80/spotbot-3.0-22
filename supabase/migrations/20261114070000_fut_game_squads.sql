-- My current squad: the squads the user opened in the EA Web App, as the XI Lab helper (0.13.0+) copied them inside
-- the club file (formation code and which of their items is in which place). Squad Builder turns the active one
-- into "my current squad". Private to the owner via fut-api (service role only).

CREATE TABLE fut.game_squads (
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- "active" or the squad's number in the Web App address
  squad_key      TEXT NOT NULL CHECK (squad_key ~ '^(active|[0-9]{1,6})$'),
  name           TEXT,
  -- EA's formation code as sent ("f4231a"); mapped to a formation name in current-squad.ts
  formation_code TEXT,
  active         BOOLEAN NOT NULL DEFAULT false,
  seen_at        TIMESTAMPTZ NOT NULL,
  -- [{ index, ea_item_id }]: 0-10 the starting eleven, 11-22 bench and reserves
  players        JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Field names (never values) EA sent, to check the FC 27 shape
  fields         JSONB NOT NULL DEFAULT '[]'::JSONB,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, squad_key)
);

GRANT ALL ON fut.game_squads TO service_role;
ALTER TABLE fut.game_squads ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: service role only.
