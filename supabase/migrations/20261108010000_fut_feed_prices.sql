-- Scheduled third-party price snapshots (Jeff, 2026-11-08): every card in each fc27-market /latest snapshot, with the
-- feed's own snapshot time. Reference data for the fut-api service only (service role); never public, never MCP.
-- fc27-market is a third-party copy of FUT.GG's prices, not EA's market; platform isn't identified (stored as console).
CREATE TABLE fut.market_feed_prices (
  id           BIGSERIAL PRIMARY KEY,
  source_id    TEXT NOT NULL REFERENCES fut.market_price_sources(id),
  ea_item_id   BIGINT NOT NULL CHECK (ea_item_id > 0),
  grp          TEXT NOT NULL,
  name         TEXT,
  rating       INTEGER,
  rarity_id    INTEGER,
  price        INTEGER NOT NULL CHECK (price > 0),
  feed_updated TIMESTAMPTZ NOT NULL,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, ea_item_id, feed_updated)
);
CREATE INDEX fut_mfp_latest ON fut.market_feed_prices (source_id, feed_updated DESC);
CREATE INDEX fut_mfp_item ON fut.market_feed_prices (ea_item_id, feed_updated DESC);

GRANT ALL ON fut.market_feed_prices TO service_role;
GRANT ALL ON SEQUENCE fut.market_feed_prices_id_seq TO service_role;
ALTER TABLE fut.market_feed_prices ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: service role only.

UPDATE fut.market_price_sources
   SET status_note = 'Pulled hourly by the server, and on request, from the public fc27-market API (Val Town project bowli/fut-market-api). Third-party hobby project, not licensed by EA and not EA''s market: its prices come from FUT.GG''s price file; platform not identified (stored as console). Covers the top 100 cards per group. Private to you.'
 WHERE id = 'fc27_market';
NOTIFY pgrst, 'reload schema';
