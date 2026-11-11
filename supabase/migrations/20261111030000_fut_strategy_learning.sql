-- Daily Strategy learning: every FUT.GG refresh the bot's `strategy-learn` job logs the market-wide buy candidates
-- and sell signals (plain rules, no learning applied), later settles each against the prices since (a buy "hit" when
-- the price reached its target within 4 days; a sell call was "good" when holding would have lost), and keeps a
-- small model per platform learned from the last 30 days of results. Market-wide, not per user: picks come from
-- public FUT.GG prices only. Service role only. Advice only: nothing here trades.
CREATE TABLE IF NOT EXISTS fut.strategy_pick_log (
  platform     TEXT NOT NULL CHECK (platform IN ('console', 'pc')),
  side         TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  ea_item_id   BIGINT NOT NULL CHECK (ea_item_id > 0),
  picked_at    TIMESTAMPTZ NOT NULL,                 -- the FUT.GG refresh the pick was made on
  rank         SMALLINT NOT NULL CHECK (rank > 0),
  price        INTEGER NOT NULL CHECK (price > 0),   -- buy: price to buy at; sell: price to list at
  target       INTEGER NOT NULL CHECK (target > 0),  -- buy: plain-rules sell target; sell: the 7-day middle price
  features     JSONB NOT NULL,
  outcome      TEXT CHECK (outcome IN ('hit', 'miss', 'good', 'bad', 'expired')),
  resolved_at  TIMESTAMPTZ,
  hours_to_hit INTEGER,
  best_price   INTEGER,
  final_price  INTEGER,
  PRIMARY KEY (platform, side, ea_item_id, picked_at)
);
CREATE INDEX IF NOT EXISTS strategy_pick_log_open ON fut.strategy_pick_log (platform, picked_at) WHERE outcome IS NULL;
CREATE INDEX IF NOT EXISTS strategy_pick_log_time ON fut.strategy_pick_log (platform, picked_at DESC);

CREATE TABLE IF NOT EXISTS fut.strategy_model (
  platform   TEXT PRIMARY KEY CHECK (platform IN ('console', 'pc')),
  model      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE fut.strategy_pick_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.strategy_model ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fut.strategy_pick_log, fut.strategy_model FROM PUBLIC, anon, authenticated;
GRANT ALL ON fut.strategy_pick_log, fut.strategy_model TO service_role;

NOTIFY pgrst, 'reload schema';
