-- Market-wide card list for Market Lab: one catalogue card (owner_user_id NULL) per FUT.GG price entry, named from
-- EA's public Web App player file. Written only by the bot's twice-daily job (service role). Jeff chose on
-- 2026-11-08 to build this shared list rather than wait for a licensed catalogue.
INSERT INTO fut.data_sources (id, name, kind, url, terms_status, terms_notes) VALUES
  ('futgg_catalogue', 'FUT.GG card pool + EA Web App player names', 'dataset', 'https://www.fut.gg/', 'approved',
   'Public files: FUT.GG''s card pool (rating, position, club, nation, league, card type) and the EA FC Web App''s player name file. Read twice a day; not an EA or FUT.GG licence. Shared read-only catalogue cards.')
ON CONFLICT (id) DO NOTHING;

-- Catalogue cards that Market Lab analyses (latest console or PC price of 1,000 coins or more). The rest stay
-- searchable but out of the market snapshot, which keeps each Market Lab request small.
ALTER TABLE fut.player_cards ADD COLUMN IF NOT EXISTS market_tracked BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS fut_player_cards_market_tracked ON fut.player_cards (source_id) WHERE owner_user_id IS NULL AND market_tracked;

CREATE OR REPLACE FUNCTION fut.upsert_futgg_catalogue(p_cards JSONB)
RETURNS INTEGER LANGUAGE plpgsql SET search_path = pg_catalog, fut AS $$
DECLARE n INTEGER;
BEGIN
  IF jsonb_typeof(p_cards) IS DISTINCT FROM 'array' OR jsonb_array_length(p_cards) > 5000 THEN
    RAISE EXCEPTION 'Catalogue batch must be an array of at most 5000 cards';
  END IF;
  INSERT INTO fut.player_cards AS c (owner_user_id, season, player_name, version, overall, positions, club, league, nation,
    is_icon, is_hero, evidence, source_id, source_card_key, source_updated_at)
  SELECT NULL, 'FC27', left(x.name, 60), left(x.version, 40), x.overall, ARRAY[x.position], left(x.club, 60), left(x.league, 60), left(x.nation, 60),
    coalesce(x.is_icon, false), coalesce(x.is_hero, false), 'game_data', 'futgg_catalogue', x.ea_item_id::TEXT, x.published_at
  FROM jsonb_to_recordset(p_cards) AS x(ea_item_id BIGINT, name TEXT, version TEXT, overall SMALLINT, position TEXT, club TEXT,
    league TEXT, nation TEXT, is_icon BOOLEAN, is_hero BOOLEAN, published_at TIMESTAMPTZ)
  WHERE x.ea_item_id > 0 AND length(trim(x.name)) > 0 AND x.overall BETWEEN 1 AND 99
    AND x.position IN (SELECT code FROM fut.positions)
  ON CONFLICT (source_id, source_card_key) WHERE source_card_key IS NOT NULL DO UPDATE SET
    player_name = EXCLUDED.player_name, version = EXCLUDED.version, overall = EXCLUDED.overall, positions = EXCLUDED.positions,
    club = EXCLUDED.club, league = EXCLUDED.league, nation = EXCLUDED.nation, is_icon = EXCLUDED.is_icon, is_hero = EXCLUDED.is_hero,
    source_updated_at = EXCLUDED.source_updated_at, updated_at = now()
  WHERE (c.player_name, c.version, c.overall, c.positions, c.club, c.league, c.nation, c.is_icon, c.is_hero)
    IS DISTINCT FROM (EXCLUDED.player_name, EXCLUDED.version, EXCLUDED.overall, EXCLUDED.positions, EXCLUDED.club, EXCLUDED.league,
      EXCLUDED.nation, EXCLUDED.is_icon, EXCLUDED.is_hero);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION fut.upsert_futgg_catalogue(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.upsert_futgg_catalogue(JSONB) TO service_role;

-- Marks the catalogue cards whose latest FUT.GG price (either platform) is at least p_min_price coins.
CREATE OR REPLACE FUNCTION fut.refresh_futgg_tracked(p_min_price INTEGER DEFAULT 1000)
RETURNS INTEGER LANGUAGE plpgsql SET search_path = pg_catalog, fut AS $$
DECLARE n INTEGER;
BEGIN
  WITH latest AS (
    SELECT platform, max(published_at) AS at FROM fut.futgg_prices WHERE game_year = 27 GROUP BY platform
  ), hot AS (
    SELECT DISTINCT p.ea_item_id::TEXT AS key FROM fut.futgg_prices p JOIN latest l ON l.platform = p.platform AND l.at = p.published_at
    WHERE p.game_year = 27 AND p.price >= p_min_price
  )
  UPDATE fut.player_cards c SET market_tracked = (c.source_card_key IN (SELECT key FROM hot))
  WHERE c.owner_user_id IS NULL AND c.source_id = 'futgg_catalogue'
    AND c.market_tracked IS DISTINCT FROM (c.source_card_key IN (SELECT key FROM hot));
  SELECT count(*) INTO n FROM fut.player_cards WHERE owner_user_id IS NULL AND source_id = 'futgg_catalogue' AND market_tracked;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION fut.refresh_futgg_tracked(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.refresh_futgg_tracked(INTEGER) TO service_role;
NOTIFY pgrst, 'reload schema';
