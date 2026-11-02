-- XI Lab Market Lab, Stage A (jgor80/11-lab docs/market-lab.md). Additive only: new tables in the `fut` schema.
-- Same walls as 20261102020000_fut_schema.sql: only service_role is granted; RLS with owner-only policies.
--   * Prices carry three clocks (observed_at, received_at, event_at) so backtests can't see the future.
--   * owner_user_id NULL = a shared source (only an authorised feed); set = the user's own private import.
--   * No provider is authorised today, so nothing is shared: the only prices are users' own imports.
--   * No EA or scraped data is loaded here. Nothing in Market Lab buys, sells, bids or touches an EA account.

CREATE TABLE fut.market_price_sources (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('demo', 'user_import', 'browser_capture', 'licensed_feed', 'official_api')),
  status       TEXT NOT NULL CHECK (status IN ('enabled', 'disabled', 'not_authorized')),
  is_demo      BOOLEAN NOT NULL DEFAULT false,
  status_note  TEXT NOT NULL,
  -- commercial_use, storage, retention_days, display, derived_analytics, model_training, redistribution, attribution
  permissions  JSONB NOT NULL,
  evidence     TEXT NOT NULL CHECK (evidence IN ('verified', 'game_data', 'estimate', 'hypothesis')),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fut.market_price_observations (
  id             BIGSERIAL PRIMARY KEY,
  card_id        UUID NOT NULL REFERENCES fut.player_cards(id) ON DELETE CASCADE,
  platform       TEXT NOT NULL CHECK (platform IN ('console', 'pc')),
  price          INTEGER NOT NULL CHECK (price > 0 AND price <= 15000000),
  kind           TEXT NOT NULL DEFAULT 'lowest_bin' CHECK (kind IN ('lowest_bin', 'sale', 'user_quote')),
  observed_at    TIMESTAMPTZ NOT NULL,
  received_at    TIMESTAMPTZ NOT NULL,
  event_at       TIMESTAMPTZ,
  season         TEXT NOT NULL DEFAULT 'FC27',
  source_id      TEXT NOT NULL REFERENCES fut.market_price_sources(id),
  owner_user_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  evidence       TEXT NOT NULL CHECK (evidence IN ('verified', 'game_data', 'estimate', 'hypothesis')),
  quality        JSONB,
  CHECK (received_at >= observed_at)
);
CREATE UNIQUE INDEX fut_mpo_unique ON fut.market_price_observations (COALESCE(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid), source_id, card_id, platform, observed_at);
CREATE INDEX fut_mpo_card ON fut.market_price_observations (card_id, platform, observed_at DESC);
CREATE INDEX fut_mpo_owner ON fut.market_price_observations (owner_user_id, platform, observed_at);

CREATE TABLE fut.market_baskets (
  id           TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  grp          TEXT NOT NULL,
  description  TEXT NOT NULL,
  rule         JSONB NOT NULL
);

-- Point-in-time membership. Baskets are built from catalogue cards only (owner_user_id NULL), never private cards.
CREATE TABLE fut.market_basket_members (
  basket_id       TEXT NOT NULL REFERENCES fut.market_baskets(id) ON DELETE CASCADE,
  card_id         UUID NOT NULL REFERENCES fut.player_cards(id) ON DELETE CASCADE,
  effective_from  TIMESTAMPTZ NOT NULL,
  effective_to    TIMESTAMPTZ,
  backfilled      BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (basket_id, card_id, effective_from)
);

CREATE TABLE fut.market_rule_versions (
  id         TEXT PRIMARY KEY,
  status     TEXT NOT NULL CHECK (status IN ('unverified', 'verified', 'retired')),
  is_active  BOOLEAN NOT NULL DEFAULT false,
  notes      TEXT NOT NULL,
  body       JSONB NOT NULL
);
CREATE UNIQUE INDEX fut_one_active_market_rule ON fut.market_rule_versions (is_active) WHERE is_active;

CREATE TABLE fut.market_watchlist (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id       UUID NOT NULL REFERENCES fut.player_cards(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('console', 'pc')),
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  note          TEXT CHECK (length(note) <= 280),
  target_buy    INTEGER CHECK (target_buy >= 0),
  target_sell   INTEGER CHECK (target_sell >= 0),
  price_at_add  INTEGER,
  price_at_add_observed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, card_id, platform)
);

-- Captured Web App prices for EA items not in the user's cards yet (promos, Icons, Heroes). Private; moved into
-- market_price_observations once a card with that EA item id exists, or the user links one by hand.
CREATE TABLE fut.market_capture_holds (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ea_item_id   BIGINT NOT NULL CHECK (ea_item_id > 0),
  asset_id     BIGINT,
  rating       SMALLINT CHECK (rating BETWEEN 1 AND 99),
  platform     TEXT NOT NULL CHECK (platform IN ('console', 'pc')),
  observed_at  TIMESTAMPTZ NOT NULL,
  details      JSONB,
  observation  JSONB NOT NULL,
  PRIMARY KEY (user_id, ea_item_id, platform, observed_at)
);

CREATE TABLE fut.market_provider_runs (
  id           BIGSERIAL PRIMARY KEY,
  source_id    TEXT NOT NULL REFERENCES fut.market_price_sources(id),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  status       TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  accepted     INTEGER NOT NULL DEFAULT 0,
  rejected     INTEGER NOT NULL DEFAULT 0,
  message      TEXT
);

-- ---------------------------------------------------------------- access

GRANT ALL ON fut.market_price_sources, fut.market_price_observations, fut.market_baskets, fut.market_basket_members,
  fut.market_rule_versions, fut.market_watchlist, fut.market_capture_holds, fut.market_provider_runs TO service_role;
GRANT ALL ON SEQUENCE fut.market_price_observations_id_seq, fut.market_provider_runs_id_seq TO service_role;

ALTER TABLE fut.market_price_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.market_price_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.market_baskets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.market_basket_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.market_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.market_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.market_capture_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.market_provider_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users read reference data" ON fut.market_price_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed-in users read reference data" ON fut.market_baskets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed-in users read reference data" ON fut.market_basket_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed-in users read reference data" ON fut.market_rule_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Shared or own prices" ON fut.market_price_observations FOR SELECT TO authenticated
  USING (owner_user_id IS NULL OR owner_user_id = auth.uid());
CREATE POLICY "Own prices only" ON fut.market_price_observations FOR ALL TO authenticated
  USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "Owners only" ON fut.market_watchlist FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owners only" ON fut.market_capture_holds FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owners only" ON fut.market_provider_runs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------- seed (same values as 11-lab migrations/0004_market_lab.sql)

INSERT INTO fut.market_price_sources (id, name, kind, status, is_demo, status_note, permissions, evidence) VALUES
  ('xilab_demo', 'XI Lab demo dataset', 'demo', 'disabled', true,
   'Made-up prices for made-up cards. Used only in the browser demo and tests; never stored here.',
   '{"commercial_use":false,"storage":true,"retention_days":null,"display":true,"derived_analytics":true,"model_training":false,"redistribution":false,"attribution":null}', 'hypothesis'),
  ('user_import', 'Your imported price history', 'user_import', 'enabled', false,
   'Prices you import yourself. Private to you; XI Lab does not check where they came from.',
   '{"commercial_use":false,"storage":true,"retention_days":null,"display":true,"derived_analytics":true,"model_training":false,"redistribution":false,"attribution":null}', 'estimate'),
  ('web_app_capture', 'Your Web App captures (XI Lab browser helper)', 'browser_capture', 'enabled', false,
   'Lowest Buy Now prices from transfer-market searches YOU ran in the EA Web App, read from results the Web App already loaded. The helper never searches, clicks or bids. Only the listings you viewed, not the whole market. Private to you. Third-party software on EA''s site carries some account risk (Jeff accepted it on 2026-11-02).',
   '{"commercial_use":false,"storage":true,"retention_days":null,"display":true,"derived_analytics":true,"model_training":false,"redistribution":false,"attribution":null}', 'game_data'),
  ('ea_fc_community_api', 'EA FC Community API', 'official_api', 'not_authorized', false,
   'Closed to new partners as of 2026-11-02. Not connected.',
   '{"commercial_use":false,"storage":false,"retention_days":null,"display":false,"derived_analytics":false,"model_training":false,"redistribution":false,"attribution":null}', 'verified'),
  ('futbin', 'FUTBIN', 'licensed_feed', 'not_authorized', false,
   'No licence or API agreement. Blocks automated access; not scraped.',
   '{"commercial_use":false,"storage":false,"retention_days":null,"display":false,"derived_analytics":false,"model_training":false,"redistribution":false,"attribution":null}', 'game_data'),
  ('futgg', 'FUT.GG', 'licensed_feed', 'not_authorized', false,
   'No licence or API agreement. Blocks automated access; not scraped.',
   '{"commercial_use":false,"storage":false,"retention_days":null,"display":false,"derived_analytics":false,"model_training":false,"redistribution":false,"attribution":null}', 'game_data'),
  ('futwiz', 'FUTWIZ', 'licensed_feed', 'not_authorized', false,
   'No licence or API agreement. Blocks automated access; not scraped.',
   '{"commercial_use":false,"storage":false,"retention_days":null,"display":false,"derived_analytics":false,"model_training":false,"redistribution":false,"attribution":null}', 'game_data');

INSERT INTO fut.market_rule_versions (id, status, is_active, notes, body) VALUES
  ('fc27-market-v1', 'unverified', true,
   'Transfer tax 5% of the sale price (floored) and price bands are community knowledge as of 2026-11-02, not confirmed by EA. Scanner thresholds are XI Lab defaults, not validated against outcomes.',
   '{"transfer_tax_rate":0.05,"price_steps":[{"from":0,"step":50},{"from":1000,"step":100},{"from":10000,"step":250},{"from":50000,"step":500},{"from":100000,"step":1000}],"min_price":200,"stale_after_hours":6,"min_points":6,"thresholds":{"relative_strength_pp":3,"regime_trend_24h":2,"regime_trend_7d":4,"high_volatility":2.5,"sbc_spread_pp":4,"priced_in_72h":25,"mean_reversion_z":-1.5}}');
