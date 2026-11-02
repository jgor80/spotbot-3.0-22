-- XI Lab (the FUT side of GafferBot), Phase 1 tables (21). Everything lives in its own `fut` schema:
--   * GafferBot's existing tables are not touched; `DROP SCHEMA fut CASCADE` removes XI Lab entirely.
--   * Only the service role (the fut-api function and the MCP FUT tools) is granted the schema. The browser's
--     anon/authenticated roles get nothing, and RLS with owner-only policies is on as a second wall.
--   * Users are keyed by auth.users(id). No GafferBot club or server is needed to use XI Lab.
--   * EA's ratings database is NOT loaded here until there is a licence: launch cards are user-entered
--     (player_cards.owner_user_id set). Catalogue rows (owner_user_id NULL) come only from approved sources.
-- For the fut-api function to reach this schema, add `fut` to PostgREST's exposed schemas (PGRST_DB_SCHEMAS)
-- on the server; the grants below still keep the browser out.

CREATE SCHEMA IF NOT EXISTS fut;

-- ---------------------------------------------------------------- provenance

CREATE TABLE fut.data_sources (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('manual', 'user', 'official', 'dataset', 'api')),
  url           TEXT,
  terms_status  TEXT NOT NULL CHECK (terms_status IN ('approved', 'pending_review', 'blocked')),
  terms_notes   TEXT NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fut.import_runs (
  id                 BIGSERIAL PRIMARY KEY,
  source_id          TEXT NOT NULL REFERENCES fut.data_sources(id),
  input_ref          TEXT,
  input_sha256       TEXT,
  source_snapshot_at TIMESTAMPTZ,
  terms_accepted_by  TEXT,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at        TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  records_seen       INTEGER NOT NULL DEFAULT 0,
  records_written    INTEGER NOT NULL DEFAULT 0,
  records_rejected   INTEGER NOT NULL DEFAULT 0,
  notes              TEXT
);

-- ---------------------------------------------------------------- reference data

CREATE TABLE fut.nations (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, ea_id INTEGER UNIQUE);
CREATE TABLE fut.leagues (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, ea_id INTEGER UNIQUE, gender TEXT CHECK (gender IN ('men', 'women')));
CREATE TABLE fut.clubs (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  league_id  BIGINT REFERENCES fut.leagues(id),
  ea_id      INTEGER UNIQUE,
  UNIQUE (name, league_id)
);

CREATE TABLE fut.positions (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  line        TEXT NOT NULL CHECK (line IN ('GK', 'DEF', 'MID', 'ATT')),
  sort_order  INTEGER NOT NULL
);

CREATE TABLE fut.formations (
  id      TEXT PRIMARY KEY,                     -- '3-5-2'
  season  TEXT NOT NULL,
  name    TEXT NOT NULL
);

CREATE TABLE fut.formation_slots (
  formation_id  TEXT NOT NULL REFERENCES fut.formations(id) ON DELETE CASCADE,
  slot          TEXT NOT NULL,                  -- 'LCB'
  position_code TEXT NOT NULL REFERENCES fut.positions(code),
  sort_order    INTEGER NOT NULL,
  PRIMARY KEY (formation_id, slot)
);

-- ---------------------------------------------------------------- cards

-- One row per card version. id is the card's own identity, independent of the footballer.
-- owner_user_id NULL = catalogue card from an approved source; set = a private card that user typed in.
CREATE TABLE fut.player_cards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  season              TEXT NOT NULL DEFAULT 'FC27',
  player_name         TEXT NOT NULL CHECK (length(player_name) BETWEEN 1 AND 60),
  version             TEXT CHECK (length(version) <= 40),
  overall             SMALLINT NOT NULL CHECK (overall BETWEEN 1 AND 99),
  positions           TEXT[] NOT NULL CHECK (cardinality(positions) BETWEEN 1 AND 5),  -- primary first
  club                TEXT CHECK (length(club) <= 60),
  league              TEXT CHECK (length(league) <= 60),
  nation              TEXT CHECK (length(nation) <= 60),
  is_icon             BOOLEAN NOT NULL DEFAULT false,
  is_hero             BOOLEAN NOT NULL DEFAULT false,
  skill_moves         SMALLINT CHECK (skill_moves BETWEEN 1 AND 5),
  weak_foot           SMALLINT CHECK (weak_foot BETWEEN 1 AND 5),
  attacking_work_rate TEXT CHECK (attacking_work_rate IN ('low', 'medium', 'high')),
  defensive_work_rate TEXT CHECK (defensive_work_rate IN ('low', 'medium', 'high')),
  evidence            TEXT NOT NULL CHECK (evidence IN ('verified', 'game_data', 'estimate', 'hypothesis')),
  source_id           TEXT NOT NULL REFERENCES fut.data_sources(id),
  source_card_key     TEXT,
  source_updated_at   TIMESTAMPTZ,
  import_run_id       BIGINT REFERENCES fut.import_runs(id),
  -- Coins to buy it as the user last saw it (user cards) or from a permitted price feed (never scraped).
  price               INTEGER CHECK (price >= 0),
  notes               TEXT CHECK (length(notes) <= 280),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Only users can type cards in, and user cards are never catalogue cards.
  CHECK ((owner_user_id IS NULL) = (source_id <> 'user_entered')),
  -- Nothing a user types is ever 'verified'.
  CHECK (owner_user_id IS NULL OR evidence <> 'verified')
);
CREATE UNIQUE INDEX fut_player_cards_source_key ON fut.player_cards(source_id, source_card_key) WHERE source_card_key IS NOT NULL;
CREATE INDEX fut_player_cards_owner ON fut.player_cards(owner_user_id, overall DESC);
CREATE INDEX fut_player_cards_catalogue ON fut.player_cards(season, overall DESC) WHERE owner_user_id IS NULL;

-- Face stats as columns (filters stay simple); sub-attributes in `detail` by key. A value nobody entered stays absent.
CREATE TABLE fut.card_attributes (
  card_id  UUID PRIMARY KEY REFERENCES fut.player_cards(id) ON DELETE CASCADE,
  pac      SMALLINT CHECK (pac BETWEEN 1 AND 99),
  sho      SMALLINT CHECK (sho BETWEEN 1 AND 99),
  pas      SMALLINT CHECK (pas BETWEEN 1 AND 99),
  dri      SMALLINT CHECK (dri BETWEEN 1 AND 99),
  def      SMALLINT CHECK (def BETWEEN 1 AND 99),
  phy      SMALLINT CHECK (phy BETWEEN 1 AND 99),
  detail   JSONB NOT NULL DEFAULT '{}'::jsonb   -- {"standing_tackle": 88, ...}
);

CREATE TABLE fut.card_playstyles (
  card_id  UUID NOT NULL REFERENCES fut.player_cards(id) ON DELETE CASCADE,
  name     TEXT NOT NULL CHECK (length(name) <= 40),
  is_plus  BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (card_id, name)
);

CREATE TABLE fut.card_roles (
  card_id        UUID NOT NULL REFERENCES fut.player_cards(id) ON DELETE CASCADE,
  position_code  TEXT NOT NULL REFERENCES fut.positions(code),
  role           TEXT NOT NULL CHECK (length(role) <= 40),
  level          TEXT NOT NULL CHECK (level IN ('plus', 'plusplus')),
  PRIMARY KEY (card_id, position_code, role)
);

-- ---------------------------------------------------------------- chemistry rules (versioned, editable)

CREATE TABLE fut.chemistry_rule_versions (
  id            TEXT PRIMARY KEY,
  season        TEXT NOT NULL,
  label         TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('unverified', 'verified', 'retired')),
  is_active     BOOLEAN NOT NULL DEFAULT false,
  source_notes  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at   TIMESTAMPTZ,
  verified_by   TEXT
);
CREATE UNIQUE INDEX fut_one_active_rule ON fut.chemistry_rule_versions(season) WHERE is_active;

CREATE TABLE fut.chemistry_thresholds (
  rule_version_id  TEXT NOT NULL REFERENCES fut.chemistry_rule_versions(id) ON DELETE CASCADE,
  link_type        TEXT NOT NULL CHECK (link_type IN ('club', 'league', 'nation')),
  points           SMALLINT NOT NULL CHECK (points BETWEEN 1 AND 3),
  players_required SMALLINT NOT NULL CHECK (players_required >= 1),
  PRIMARY KEY (rule_version_id, link_type, points)
);

CREATE TABLE fut.chemistry_modifiers (
  rule_version_id  TEXT NOT NULL REFERENCES fut.chemistry_rule_versions(id) ON DELETE CASCADE,
  key              TEXT NOT NULL,
  value            INTEGER NOT NULL,
  description      TEXT NOT NULL,
  PRIMARY KEY (rule_version_id, key)
);

-- ---------------------------------------------------------------- the user's club

CREATE TABLE fut.accounts (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  season        TEXT NOT NULL DEFAULT 'FC27',
  platform      TEXT CHECK (platform IN ('playstation', 'xbox', 'pc', 'switch')),
  coin_balance  INTEGER CHECK (coin_balance >= 0),
  settings      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fut.club_inventory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id         UUID NOT NULL REFERENCES fut.player_cards(id) ON DELETE CASCADE,
  tradeable       BOOLEAN,
  purchase_price  INTEGER CHECK (purchase_price >= 0),
  acquired_how    TEXT CHECK (acquired_how IN ('pack', 'market', 'sbc', 'objective', 'evolution', 'reward', 'other')),
  acquired_at     DATE,
  protected       BOOLEAN NOT NULL DEFAULT false,
  favourite       BOOLEAN NOT NULL DEFAULT false,
  quantity        SMALLINT NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, card_id)
);

-- Squads as XI Lab's squad workspace saves them (jgor80/11-lab src/workspace). Ids are the workspace's own
-- ("sq_<uuid>"), so a squad built in the browser keeps its id when saved.
-- Managers the user typed in (name, nation, league), so the optimizer can suggest a manager change.
CREATE TABLE fut.user_managers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  nation         TEXT CHECK (length(nation) <= 60),
  league         TEXT CHECK (length(league) <= 60),
  price          INTEGER CHECK (price >= 0),
  owned          BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX fut_user_managers_user ON fut.user_managers(user_id);

CREATE TABLE fut.squads (
  id           TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 200),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  season       TEXT NOT NULL DEFAULT 'FC27',
  formation    TEXT NOT NULL CHECK (length(formation) <= 20),
  platform     TEXT CHECK (length(platform) <= 40),
  manager      JSONB,                                             -- {id, name, nation, league, price, owned}
  budget       INTEGER NOT NULL DEFAULT 0 CHECK (budget >= 0),   -- coins available for upgrades
  is_active    BOOLEAN NOT NULL DEFAULT false,
  parent_id    TEXT REFERENCES fut.squads(id) ON DELETE SET NULL, -- "save as" keeps the original
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX fut_squads_user ON fut.squads(user_id, updated_at DESC);
CREATE UNIQUE INDEX fut_one_active_squad ON fut.squads(user_id) WHERE is_active;

CREATE TABLE fut.squad_slots (
  squad_id         TEXT NOT NULL REFERENCES fut.squads(id) ON DELETE CASCADE,
  slot             TEXT NOT NULL CHECK (length(slot) <= 8),       -- 'LCB'
  position_code    TEXT NOT NULL CHECK (position_code ~ '^[A-Z]{2,4}$'),
  -- The stored card when the slot holds one of the user's cards (or a catalogue card); read fresh on load.
  card_id          UUID REFERENCES fut.player_cards(id) ON DELETE SET NULL,
  -- The card as the workspace saved it, used when it isn't a stored card (e.g. a market target typed into the squad).
  card             JSONB,
  chemistry_style  TEXT CHECK (length(chemistry_style) <= 30),
  role             TEXT CHECK (length(role) <= 40),
  focus            TEXT CHECK (length(focus) <= 40),
  locked           BOOLEAN NOT NULL DEFAULT false,
  sort_order       SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (squad_id, slot)
);

-- Every optimizer run, with the engine and rule versions that produced it, so a result can be audited later.
CREATE TABLE fut.optimization_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  squad_id        TEXT REFERENCES fut.squads(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('chemistry', 'swap_preview', 'optimize')),
  engine_version  TEXT NOT NULL,
  rule_version_id TEXT REFERENCES fut.chemistry_rule_versions(id),
  input           JSONB NOT NULL,
  result          JSONB NOT NULL,
  via             TEXT NOT NULL CHECK (via IN ('web', 'mcp')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX fut_optimization_runs_user ON fut.optimization_runs(user_id, created_at DESC);

-- ---------------------------------------------------------------- access

-- Service role only. The browser's roles get no grants, so even with `fut` exposed in PostgREST they can't read it.
REVOKE ALL ON SCHEMA fut FROM PUBLIC;
GRANT USAGE ON SCHEMA fut TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA fut TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA fut TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA fut GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA fut GRANT ALL ON SEQUENCES TO service_role;

-- RLS everywhere as a second wall: owners see their own rows, catalogue and reference rows are readable.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['data_sources', 'import_runs', 'nations', 'leagues', 'clubs', 'positions', 'formations',
    'formation_slots', 'player_cards', 'card_attributes', 'card_playstyles', 'card_roles', 'chemistry_rule_versions',
    'chemistry_thresholds', 'chemistry_modifiers', 'accounts', 'club_inventory', 'user_managers', 'squads', 'squad_slots', 'optimization_runs'] LOOP
    EXECUTE format('ALTER TABLE fut.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['data_sources', 'nations', 'leagues', 'clubs', 'positions', 'formations', 'formation_slots',
    'chemistry_rule_versions', 'chemistry_thresholds', 'chemistry_modifiers'] LOOP
    EXECUTE format('CREATE POLICY "Signed-in users read reference data" ON fut.%I FOR SELECT TO authenticated USING (true)', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['accounts', 'club_inventory', 'user_managers', 'squads', 'optimization_runs'] LOOP
    EXECUTE format('CREATE POLICY "Owners only" ON fut.%I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t);
  END LOOP;
END $$;

CREATE POLICY "Catalogue or own cards" ON fut.player_cards FOR SELECT TO authenticated
  USING (owner_user_id IS NULL OR owner_user_id = auth.uid());
CREATE POLICY "Own cards only" ON fut.player_cards FOR ALL TO authenticated
  USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['card_attributes', 'card_playstyles', 'card_roles'] LOOP
    EXECUTE format('CREATE POLICY "Follows its card" ON fut.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM fut.player_cards c WHERE c.id = card_id AND (c.owner_user_id IS NULL OR c.owner_user_id = auth.uid())))', t);
  END LOOP;
END $$;
CREATE POLICY "Own squads' slots" ON fut.squad_slots FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM fut.squads s WHERE s.id = squad_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM fut.squads s WHERE s.id = squad_id AND s.user_id = auth.uid()));

-- ---------------------------------------------------------------- seed data

INSERT INTO fut.data_sources (id, name, kind, url, terms_status, terms_notes) VALUES
  ('user_entered', 'Cards entered by the user', 'user', NULL, 'approved',
   'Typed in by the signed-in user for their own use. Private to that user; never shown to anyone else.');

INSERT INTO fut.positions (code, name, line, sort_order) VALUES
  ('GK', 'Goalkeeper', 'GK', 1), ('RB', 'Right Back', 'DEF', 2), ('CB', 'Centre Back', 'DEF', 3),
  ('LB', 'Left Back', 'DEF', 4), ('CDM', 'Central Defensive Midfield', 'MID', 5), ('CM', 'Central Midfield', 'MID', 6),
  ('CAM', 'Central Attacking Midfield', 'MID', 7), ('RM', 'Right Midfield', 'MID', 8), ('LM', 'Left Midfield', 'MID', 9),
  ('RW', 'Right Wing', 'ATT', 10), ('LW', 'Left Wing', 'ATT', 11), ('ST', 'Striker', 'ATT', 12);

INSERT INTO fut.formations (id, season, name) VALUES ('3-5-2', 'FC27', '3-5-2');
-- Same slot names as XI Lab's workspace (src/workspace/formations.ts).
INSERT INTO fut.formation_slots (formation_id, slot, position_code, sort_order) VALUES
  ('3-5-2', 'GK', 'GK', 1), ('3-5-2', 'LCB', 'CB', 2), ('3-5-2', 'CB', 'CB', 3), ('3-5-2', 'RCB', 'CB', 4),
  ('3-5-2', 'LCDM', 'CDM', 5), ('3-5-2', 'RCDM', 'CDM', 6), ('3-5-2', 'LM', 'LM', 7), ('3-5-2', 'CAM', 'CAM', 8),
  ('3-5-2', 'RM', 'RM', 9), ('3-5-2', 'LST', 'ST', 10), ('3-5-2', 'RST', 'ST', 11);

-- Same rule versions as XI Lab (jgor80/11-lab migrations 0002 and 0003). NOT confirmed by EA. v0 is kept for history; v1 is active.
INSERT INTO fut.chemistry_rule_versions (id, season, label, status, is_active, source_notes) VALUES
  ('fc27-community-v0', 'FC27', 'FC 27 community thresholds v0', 'unverified', false,
   'Thresholds from community guides (FIFPlay, Timesaver) as of 2026-11-02. Icon/Hero contributions from Timesaver quoting EA FC 27 launch pitch notes (2026-09-14). Not checked against in-game squads yet. Mark verified only after the in-game scenario test set passes.');

INSERT INTO fut.chemistry_thresholds (rule_version_id, link_type, points, players_required) VALUES
  ('fc27-community-v0', 'club', 1, 2), ('fc27-community-v0', 'club', 2, 4), ('fc27-community-v0', 'club', 3, 7),
  ('fc27-community-v0', 'nation', 1, 2), ('fc27-community-v0', 'nation', 2, 5), ('fc27-community-v0', 'nation', 3, 8),
  ('fc27-community-v0', 'league', 1, 3), ('fc27-community-v0', 'league', 2, 5), ('fc27-community-v0', 'league', 3, 8);

INSERT INTO fut.chemistry_modifiers (rule_version_id, key, value, description) VALUES
  ('fc27-community-v0', 'player.max_chemistry', 3, 'Maximum chemistry for one player.'),
  ('fc27-community-v0', 'manager.bonus', 1, 'Extra chemistry for a player whose nation or league matches the manager.'),
  ('fc27-community-v0', 'icon.nation_bonus', 1, 'Extra nation count an Icon adds (community reading of FC 27 pitch notes).'),
  ('fc27-community-v0', 'icon.every_league_bonus', 1, 'An Icon adds 1 to the count of every league in the XI (community reading).'),
  ('fc27-community-v0', 'hero.league_bonus', 1, 'Extra league count a Hero adds (community reading).'),
  ('fc27-community-v0', 'hero.nation_bonus', 1, 'Extra nation count a Hero adds (community reading).');

INSERT INTO fut.chemistry_rule_versions (id, season, label, status, is_active, source_notes) VALUES
  ('fc27-community-v1', 'FC27', 'FC 27 community thresholds v1 (manager counts towards links)', 'unverified', true,
   'v0 thresholds and Icon/Hero rules (community guides, not confirmed by EA). Manager rule changed on 2026-11-02: Jeff confirmed in game that the manager adds +1 towards the link count, not +1 chemistry. Still unverified until the in-game seed squad test passes.');

INSERT INTO fut.chemistry_thresholds (rule_version_id, link_type, points, players_required)
  SELECT 'fc27-community-v1', link_type, points, players_required
  FROM fut.chemistry_thresholds WHERE rule_version_id = 'fc27-community-v0';

INSERT INTO fut.chemistry_modifiers (rule_version_id, key, value, description)
  SELECT 'fc27-community-v1', key, value, description
  FROM fut.chemistry_modifiers WHERE rule_version_id = 'fc27-community-v0' AND key <> 'manager.bonus';

INSERT INTO fut.chemistry_modifiers (rule_version_id, key, value, description) VALUES
  ('fc27-community-v1', 'manager.nation_count', 1, 'The manager adds 1 to the count of their nation (Jeff, in game, 2026-11-02).'),
  ('fc27-community-v1', 'manager.league_count', 1, 'The manager adds 1 to the count of their league (Jeff, in game, 2026-11-02).'),
  ('fc27-community-v1', 'icon.always_max', 1, 'An Icon in position always has max chemistry (Jeff, in game, 2026-11-02).'),
  ('fc27-community-v1', 'hero.always_max', 0, 'Heroes do NOT get automatic max chemistry (Jeff, in game, 2026-11-02).');
