-- Price history graphs and hourly prices for the cards people care about.
--
-- The full FUT.GG refresh (every card, 06:00 and 18:00 UTC) stays as it is and keeps 90 days. In between, when the
-- bot's hourly check (FUTGG_HOURLY=on) finds FUT.GG has published newer price files, only the "hot" cards are kept:
-- market-tracked catalogue cards (1,000+ coins), anything on someone's watchlist, and cards in someone's synced club.
-- Hourly rows are kept 14 days. Charts read both. Service role only, like the rest of `fut`.

CREATE TABLE fut.futgg_hot_prices (
  game_year     INTEGER NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('console', 'pc')),
  ea_item_id    BIGINT NOT NULL CHECK (ea_item_id > 0),
  published_at  TIMESTAMPTZ NOT NULL,
  price         INTEGER NOT NULL CHECK (price > 0 AND price <= 15000000),
  PRIMARY KEY (game_year, platform, ea_item_id, published_at)
);
CREATE TABLE fut.futgg_hot_runs (
  game_year     INTEGER NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('console', 'pc')),
  published_at  TIMESTAMPTZ NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  kept          INTEGER NOT NULL,
  PRIMARY KEY (game_year, platform, published_at)
);
GRANT ALL ON fut.futgg_hot_prices, fut.futgg_hot_runs TO service_role;
ALTER TABLE fut.futgg_hot_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.futgg_hot_runs ENABLE ROW LEVEL SECURITY;

-- The latest publication time already stored for a platform (full or hourly), so the bot skips unchanged files.
CREATE OR REPLACE FUNCTION fut.futgg_latest_published(p_platform TEXT)
RETURNS TIMESTAMPTZ LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  SELECT greatest((SELECT max(published_at) FROM fut.futgg_snapshots WHERE game_year = 27 AND platform = p_platform),
                  (SELECT max(published_at) FROM fut.futgg_hot_runs WHERE game_year = 27 AND platform = p_platform));
$$;
REVOKE ALL ON FUNCTION fut.futgg_latest_published(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.futgg_latest_published(TEXT) TO service_role;

-- One hourly file: the same format and checks as ingest_futgg_snapshot, but only hot cards are stored.
CREATE OR REPLACE FUNCTION fut.ingest_futgg_hot(p_platform TEXT, p_game_year INTEGER, p_published_at TIMESTAMPTZ, p_index JSONB, p_prices JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path = pg_catalog, fut SET enable_nestloop = off AS $$
DECLARE n INTEGER; kept INTEGER; fetched TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_platform NOT IN ('console', 'pc') OR p_platform IS NULL OR p_game_year IS DISTINCT FROM 27
     OR p_published_at IS NULL OR p_published_at > fetched + INTERVAL '10 minutes' OR p_published_at < fetched - INTERVAL '2 days' THEN
    RAISE EXCEPTION 'Invalid FUT.GG platform, year or publication time';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM fut.market_price_sources WHERE id = 'futgg_bulk' AND status = 'enabled') THEN
    RAISE EXCEPTION 'FUT.GG source is disabled';
  END IF;
  IF p_index->>'v' IS DISTINCT FROM '2' OR p_prices->>'v' IS DISTINCT FROM '2'
     OR jsonb_typeof(p_index->'d') IS DISTINCT FROM 'array' OR jsonb_typeof(p_prices->'p') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_prices->'s') IS DISTINCT FROM 'array' OR p_index->>'id0' IS NULL OR (p_index->>'id0')::BIGINT <= 0 THEN
    RAISE EXCEPTION 'Unsupported FUT.GG blob format';
  END IF;
  n := jsonb_array_length(p_prices->'p');
  IF n < 1 OR n > 100000 OR n <> jsonb_array_length(p_prices->'s') OR n <> jsonb_array_length(p_index->'d') + 1 THEN
    RAISE EXCEPTION 'FUT.GG price/index length mismatch';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('futgg:' || p_game_year || ':' || p_platform, 0));
  -- Already stored as a full snapshot or an hourly one: nothing to do.
  IF EXISTS (SELECT 1 FROM fut.futgg_snapshots WHERE game_year = 27 AND platform = p_platform AND published_at = p_published_at)
     OR EXISTS (SELECT 1 FROM fut.futgg_hot_runs WHERE game_year = 27 AND platform = p_platform AND published_at = p_published_at) THEN
    RETURN jsonb_build_object('unchanged', true, 'published_at', p_published_at);
  END IF;
  IF fut.futgg_latest_published(p_platform) > p_published_at THEN
    RETURN jsonb_build_object('unchanged', true, 'older', true, 'published_at', p_published_at);
  END IF;
  WITH hot AS MATERIALIZED (
    SELECT source_card_key::BIGINT AS ea_id FROM fut.player_cards
    WHERE owner_user_id IS NULL AND source_id = 'futgg_catalogue' AND market_tracked AND source_card_key ~ '^[1-9][0-9]{0,9}$'
    UNION SELECT c.source_card_key::BIGINT FROM fut.market_watchlist w JOIN fut.player_cards c ON c.id = w.card_id
    WHERE w.platform = p_platform AND c.source_card_key ~ '^[1-9][0-9]{0,9}$'
    UNION SELECT source_card_key::BIGINT FROM fut.player_cards
    WHERE owner_user_id IS NOT NULL AND source_card_key ~ '^[1-9][0-9]{0,9}$'
  ), deltas AS (
    SELECT 1::BIGINT AS ord, (p_index->>'id0')::BIGINT AS delta
    UNION ALL SELECT ordinality + 1, value::BIGINT FROM jsonb_array_elements_text(p_index->'d') WITH ORDINALITY
  ), ids AS (SELECT ord, SUM(delta) OVER (ORDER BY ord) AS ea_id FROM deltas), quotes AS (
    SELECT ids.ea_id, (p_prices->'p'->>((ord - 1)::INTEGER))::BIGINT AS raw_price, (p_prices->'s'->>((ord - 1)::INTEGER))::SMALLINT AS status
    FROM ids WHERE ids.ea_id IN (SELECT ea_id FROM hot)
  ), ins AS (
    INSERT INTO fut.futgg_hot_prices
      SELECT 27, p_platform, ea_id, p_published_at, raw_price::INTEGER FROM quotes WHERE status = 0 AND raw_price BETWEEN 1 AND 15000000
    RETURNING 1
  ) SELECT count(*) INTO kept FROM ins;
  INSERT INTO fut.futgg_hot_runs(game_year, platform, published_at, received_at, kept) VALUES (27, p_platform, p_published_at, fetched, kept);
  DELETE FROM fut.futgg_hot_prices WHERE game_year = 27 AND platform = p_platform AND published_at < fetched - INTERVAL '14 days';
  DELETE FROM fut.futgg_hot_runs WHERE game_year = 27 AND platform = p_platform AND published_at < fetched - INTERVAL '14 days';
  RETURN jsonb_build_object('unchanged', false, 'published_at', p_published_at, 'card_count', n, 'kept', kept);
END;
$$;
REVOKE ALL ON FUNCTION fut.ingest_futgg_hot(TEXT, INTEGER, TIMESTAMPTZ, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.ingest_futgg_hot(TEXT, INTEGER, TIMESTAMPTZ, JSONB, JSONB) TO service_role;

-- One card's price over the last p_days (1-90): twice-daily full snapshots plus the hourly rows, oldest first, and
-- market-wide drops: refreshes where the median tracked card fell 4%+ since the refresh before (crash markers).
CREATE OR REPLACE FUNCTION fut.card_price_history(p_platform TEXT, p_ea_item_id BIGINT, p_days INTEGER DEFAULT 30)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, fut SET enable_nestloop = off AS $$
DECLARE since TIMESTAMPTZ := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90)); result JSONB;
BEGIN
  IF p_platform NOT IN ('console', 'pc') OR p_platform IS NULL THEN RAISE EXCEPTION 'platform must be console or pc'; END IF;
  WITH pts AS (
    SELECT published_at AS t, price, 'full' AS kind FROM fut.futgg_prices
    WHERE game_year = 27 AND platform = p_platform AND ea_item_id = p_ea_item_id AND published_at >= since AND price IS NOT NULL
    UNION ALL
    SELECT h.published_at, h.price, 'hourly' FROM fut.futgg_hot_prices h
    WHERE h.game_year = 27 AND h.platform = p_platform AND h.ea_item_id = p_ea_item_id AND h.published_at >= since
  ), snaps AS MATERIALIZED (
    SELECT published_at, lag(published_at) OVER (ORDER BY published_at) AS prev FROM fut.futgg_snapshots
    WHERE game_year = 27 AND platform = p_platform AND published_at >= since - INTERVAL '2 days'
  ), tracked AS MATERIALIZED (
    SELECT source_card_key::BIGINT AS ea_id FROM fut.player_cards
    WHERE owner_user_id IS NULL AND source_id = 'futgg_catalogue' AND market_tracked AND source_card_key ~ '^[1-9][0-9]{0,9}$'
  ), moves AS (
    SELECT s.published_at AS t, percentile_cont(0.5) WITHIN GROUP (ORDER BY a.price::NUMERIC / b.price) - 1 AS median_move, count(*) AS cards
    FROM snaps s
    JOIN fut.futgg_prices a ON a.game_year = 27 AND a.platform = p_platform AND a.published_at = s.published_at AND a.price IS NOT NULL
    JOIN fut.futgg_prices b ON b.game_year = 27 AND b.platform = p_platform AND b.published_at = s.prev AND b.ea_item_id = a.ea_item_id AND b.price IS NOT NULL
    WHERE s.prev IS NOT NULL AND s.published_at >= since AND a.ea_item_id IN (SELECT ea_id FROM tracked)
    GROUP BY s.published_at
  )
  SELECT jsonb_build_object('platform', p_platform, 'ea_item_id', p_ea_item_id, 'since', since,
    'points', coalesce((SELECT jsonb_agg(jsonb_build_object('t', t, 'price', price, 'kind', kind) ORDER BY t) FROM (SELECT DISTINCT ON (t) * FROM pts ORDER BY t, kind) x), '[]'::JSONB),
    'market_drops', coalesce((SELECT jsonb_agg(jsonb_build_object('t', t, 'median_move', round((median_move * 100)::NUMERIC, 1), 'cards', cards) ORDER BY t) FROM moves WHERE median_move <= -0.04 AND cards >= 50), '[]'::JSONB)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION fut.card_price_history(TEXT, BIGINT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.card_price_history(TEXT, BIGINT, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
