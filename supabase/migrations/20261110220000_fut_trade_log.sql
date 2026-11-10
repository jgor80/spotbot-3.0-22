-- Trade log: every buy and sale the XI Lab helper saw on the user's transfer list and Transfer Targets, one row per
-- EA item id (the id stays the same while a card moves between piles, so a won item and its later sale are one trade).
-- Written by fut-api when the helper uploads the account; the profit page reads it. Service role only, like the rest
-- of `fut`. Nothing here buys, sells or lists anything.

CREATE TABLE fut.trade_log (
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform       TEXT NOT NULL CHECK (platform IN ('console', 'pc')),
  item_id        BIGINT NOT NULL CHECK (item_id > 0),
  ea_item_id     BIGINT NOT NULL,
  rating         SMALLINT,
  bought_for     INTEGER CHECK (bought_for >= 0),
  bought_at      TIMESTAMPTZ,
  -- 'watchlist' = a won Transfer Target the helper saw; 'manual' = the user typed what they paid.
  bought_source  TEXT CHECK (bought_source IN ('watchlist', 'manual')),
  listed_for     INTEGER CHECK (listed_for >= 0),
  listed_at      TIMESTAMPTZ,
  sold_for       INTEGER CHECK (sold_for >= 0),
  sold_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, platform, item_id)
);
CREATE INDEX trade_log_sold_idx ON fut.trade_log (user_id, platform, sold_at DESC);

GRANT ALL ON fut.trade_log TO service_role;
ALTER TABLE fut.trade_log ENABLE ROW LEVEL SECURITY;
