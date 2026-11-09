-- Pack Advisor: the EA pack store as the XI Lab helper copied it from the user's own Web App (prices, contents and
-- EA's published pack odds), the items the user's own pack openings gave, and rating-band prices from FUT.GG to value
-- them. Per-user tables are private to their owner and service role only (fut-api reads them for signed-in users).

CREATE TABLE fut.pack_offers (
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform       TEXT NOT NULL CHECK (platform IN ('console', 'pc')),
  pack_id        BIGINT NOT NULL CHECK (pack_id > 0),
  name           TEXT,
  name_key       TEXT,
  description    TEXT,
  state          TEXT,
  pack_type      TEXT,
  coins          INTEGER CHECK (coins > 0),
  points         INTEGER CHECK (points > 0),
  untradeable    BOOLEAN NOT NULL DEFAULT false,
  is_player_pick BOOLEAN NOT NULL DEFAULT false,
  item_count     SMALLINT,
  gold           SMALLINT,
  silver         SMALLINT,
  bronze         SMALLINT,
  rare           SMALLINT,
  content_type   TEXT,
  start_at       TIMESTAMPTZ,
  end_at         TIMESTAMPTZ,
  purchase_limit INTEGER,
  purchase_count INTEGER,
  unopened       BOOLEAN NOT NULL DEFAULT false,
  odds           JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(odds) = 'array'),
  seen_at        TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, platform, pack_id)
);

CREATE TABLE fut.pack_store_captures (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL CHECK (platform IN ('console', 'pc')),
  captured_at TIMESTAMPTZ NOT NULL,
  pack_count  INTEGER NOT NULL DEFAULT 0,
  -- Field names (never values) the helper saw on store items, to check EA's FC 27 shape.
  shape       JSONB NOT NULL DEFAULT '{}'::JSONB,
  PRIMARY KEY (user_id, platform)
);

CREATE TABLE fut.pack_pulls (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL CHECK (platform IN ('console', 'pc')),
  item_id     BIGINT NOT NULL CHECK (item_id > 0),
  ea_item_id  BIGINT NOT NULL CHECK (ea_item_id > 0),
  item_type   TEXT,
  rating      SMALLINT CHECK (rating BETWEEN 1 AND 99),
  rare_flag   INTEGER,
  untradeable BOOLEAN NOT NULL DEFAULT false,
  pack_id     BIGINT,
  opened_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX fut_pack_pulls_recent ON fut.pack_pulls (user_id, platform, opened_at DESC);

GRANT ALL ON fut.pack_offers, fut.pack_store_captures, fut.pack_pulls TO service_role;
ALTER TABLE fut.pack_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.pack_store_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.pack_pulls ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: service role only.

-- Price bands for valuing packs: per FUT.GG refresh in the last p_days, per overall and kind (common, rare, special),
-- how many catalogue cards had a price and their 25th percentile, median and mean. Kind follows Card Search: Icons,
-- Heroes and any version other than rare/common are special. Nothing here is per-user.
CREATE OR REPLACE FUNCTION fut.pack_value_bands(p_platform TEXT DEFAULT 'console', p_days INTEGER DEFAULT 8)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, fut SET enable_nestloop = off AS $$
DECLARE latest TIMESTAMPTZ; result JSONB;
BEGIN
  IF p_platform NOT IN ('console', 'pc') THEN RAISE EXCEPTION 'platform must be console or pc'; END IF;
  SELECT max(published_at) INTO latest FROM fut.futgg_snapshots WHERE game_year = 27 AND platform = p_platform;
  IF latest IS NULL THEN RETURN jsonb_build_object('platform', p_platform, 'snapshots', '[]'::JSONB); END IF;
  WITH snaps AS MATERIALIZED (
    SELECT published_at FROM fut.futgg_snapshots
    WHERE game_year = 27 AND platform = p_platform AND published_at >= latest - make_interval(days => least(greatest(coalesce(p_days, 8), 1), 14))
  ), cards AS MATERIALIZED (
    SELECT source_card_key::BIGINT AS ea_item_id, overall,
      CASE WHEN is_icon OR is_hero OR lower(coalesce(version, '')) NOT IN ('rare', 'common', '') THEN 'special'
           WHEN lower(coalesce(version, '')) = 'common' THEN 'common' ELSE 'rare' END AS kind
    FROM fut.player_cards
    WHERE owner_user_id IS NULL AND source_id = 'futgg_catalogue' AND overall >= 45 AND source_card_key ~ '^[0-9]{1,15}$'
  ), bands AS (
    SELECT p.published_at, c.overall, c.kind, count(*) AS n,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY p.price) AS p25,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY p.price) AS med,
      avg(p.price) AS mean
    FROM fut.futgg_prices p
    JOIN snaps s ON s.published_at = p.published_at
    JOIN cards c ON c.ea_item_id = p.ea_item_id
    WHERE p.game_year = 27 AND p.platform = p_platform AND p.price IS NOT NULL
    GROUP BY p.published_at, c.overall, c.kind
  ), per_snap AS (
    SELECT published_at, jsonb_agg(jsonb_build_array(overall, kind, n, round(p25), round(med), round(mean)) ORDER BY overall, kind) AS bands
    FROM bands GROUP BY published_at
  )
  SELECT jsonb_build_object('platform', p_platform,
    'snapshots', coalesce((SELECT jsonb_agg(jsonb_build_object('published_at', published_at, 'bands', bands) ORDER BY published_at) FROM per_snap), '[]'::JSONB))
  INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION fut.pack_value_bands(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.pack_value_bands(TEXT, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
