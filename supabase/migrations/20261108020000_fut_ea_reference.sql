-- EA reference prices from the helper's captures: itemData.marketAverage (meaning UNCONFIRMED; shown as "EA reference
-- price (meaning unconfirmed)") and recent lastSalePrice values of listed items. Kept apart from price history and
-- out of the market maths until verified. Private to the user; service role only.
CREATE TABLE fut.market_ea_reference (
  id             BIGSERIAL PRIMARY KEY,
  owner_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ea_item_id     BIGINT NOT NULL CHECK (ea_item_id > 0),
  platform       TEXT NOT NULL CHECK (platform IN ('console', 'pc')),
  observed_at    TIMESTAMPTZ NOT NULL,
  market_average INTEGER CHECK (market_average > 0),
  last_sales     INTEGER[] NOT NULL DEFAULT '{}',
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, ea_item_id, platform, observed_at)
);
CREATE INDEX fut_mer_item ON fut.market_ea_reference (owner_user_id, ea_item_id, platform, observed_at DESC);
GRANT ALL ON fut.market_ea_reference TO service_role;
GRANT ALL ON SEQUENCE fut.market_ea_reference_id_seq TO service_role;
ALTER TABLE fut.market_ea_reference ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: service role only.

-- fc27-market's README says its prices come from FUT.GG's player-prices-ps5.json: label them PlayStation (the console
-- market is shared by Xbox and PlayStation, so they're stored on the console market).
UPDATE fut.market_price_sources
   SET name = 'fc27-market (third-party, PlayStation prices)',
       status_note = 'Pulled hourly by the server, and on request, from the public fc27-market API (Val Town project bowli/fut-market-api). Third-party hobby project, not licensed by EA and not EA''s market: its prices come from FUT.GG''s PlayStation price file (player-prices-ps5.json). Xbox and PlayStation share one console market, so they''re stored as console prices. Covers the top 100 cards per group. Private to you.'
 WHERE id = 'fc27_market';
NOTIFY pgrst, 'reload schema';
