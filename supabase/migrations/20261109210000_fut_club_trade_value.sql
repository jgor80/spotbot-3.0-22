-- Club trade value: which of a user's synced cards are tradeable and what the tradeable ones are worth now.
-- The club sync now counts copies: quantity is every copy of a card version in the club file, tradeable_quantity
-- the copies EA doesn't mark untradeable (a packed untradeable card plus a bought tradeable copy is common).
ALTER TABLE fut.club_inventory ADD COLUMN IF NOT EXISTS tradeable_quantity SMALLINT CHECK (tradeable_quantity BETWEEN 0 AND 99);

-- One user's owned cards with the latest FUT.GG price for their EA item id and the user's own newest Web App
-- capture, whichever is newer, plus totals. Values are lowest Buy Now prices; after_tax takes EA's 5% sale tax off.
-- Service role only: fut-api passes the signed-in user's id.
CREATE OR REPLACE FUNCTION fut.club_trade_value(p_user UUID, p_platform TEXT DEFAULT 'console')
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, fut SET enable_nestloop = off AS $$
DECLARE latest TIMESTAMPTZ; last_sync TIMESTAMPTZ; result JSONB;
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'user required'; END IF;
  IF p_platform NOT IN ('console', 'pc') THEN RAISE EXCEPTION 'platform must be console or pc'; END IF;
  SELECT max(published_at) INTO latest FROM fut.futgg_snapshots WHERE game_year = 27 AND platform = p_platform;
  SELECT max(c.source_updated_at) INTO last_sync FROM fut.player_cards c
    WHERE c.owner_user_id = p_user AND c.source_id = 'user_entered' AND c.source_card_key ~ '^\d{1,10}$';
  WITH mine AS MATERIALIZED (
    SELECT c.id, c.player_name, c.version, c.overall, c.positions[1] AS position, c.club, c.league, c.nation, c.is_icon, c.is_hero,
      CASE WHEN c.source_card_key ~ '^\d{1,10}$' THEN c.source_card_key::BIGINT END AS ea_item_id,
      c.source_updated_at, i.tradeable, i.quantity,
      coalesce(i.tradeable_quantity, CASE WHEN i.tradeable THEN i.quantity ELSE 0 END) AS tradeable_quantity
    FROM fut.club_inventory i JOIN fut.player_cards c ON c.id = i.card_id
    WHERE i.user_id = p_user AND c.owner_user_id = p_user
  ), futgg AS MATERIALIZED (
    SELECT f.ea_item_id, f.price FROM fut.futgg_prices f
    WHERE latest IS NOT NULL AND f.game_year = 27 AND f.platform = p_platform AND f.published_at = latest AND f.price IS NOT NULL
      AND f.ea_item_id IN (SELECT ea_item_id FROM mine WHERE ea_item_id IS NOT NULL)
  ), captured AS MATERIALIZED (
    SELECT DISTINCT ON (o.card_id) o.card_id, o.price, o.observed_at FROM fut.market_price_observations o
    WHERE o.owner_user_id = p_user AND o.source_id = 'web_app_capture' AND o.platform = p_platform AND o.kind = 'lowest_bin'
      AND o.card_id IN (SELECT id FROM mine)
    ORDER BY o.card_id, o.observed_at DESC
  ), priced AS (
    SELECT mine.*, futgg.price AS futgg_price, captured.price AS captured_price, captured.observed_at AS captured_at,
      CASE WHEN captured.price IS NOT NULL AND (futgg.price IS NULL OR captured.observed_at > latest) THEN captured.price ELSE futgg.price END AS price,
      CASE WHEN captured.price IS NOT NULL AND (futgg.price IS NULL OR captured.observed_at > latest) THEN 'web_app_capture'
        WHEN futgg.price IS NOT NULL THEN 'futgg' END AS price_source,
      (last_sync IS NOT NULL AND mine.source_updated_at IS NOT NULL AND mine.source_updated_at < last_sync) AS missing_from_last_sync
    FROM mine LEFT JOIN futgg ON futgg.ea_item_id = mine.ea_item_id LEFT JOIN captured ON captured.card_id = mine.id
  ), rows AS (
    SELECT priced.*, price * tradeable_quantity AS value, floor(price * 0.95)::BIGINT * tradeable_quantity AS value_after_tax FROM priced
  )
  SELECT jsonb_build_object(
    'platform', p_platform, 'prices_published_at', latest, 'last_sync', last_sync,
    'totals', (SELECT jsonb_build_object(
      'cards', count(*),
      'tradeable_cards', count(*) FILTER (WHERE tradeable_quantity > 0),
      'untradeable_cards', count(*) FILTER (WHERE tradeable_quantity = 0 AND tradeable IS NOT NULL),
      'unknown_cards', count(*) FILTER (WHERE tradeable IS NULL AND tradeable_quantity = 0),
      'tradeable_copies', coalesce(sum(tradeable_quantity), 0),
      'priced_tradeable', count(*) FILTER (WHERE tradeable_quantity > 0 AND price IS NOT NULL),
      'unpriced_tradeable', count(*) FILTER (WHERE tradeable_quantity > 0 AND price IS NULL),
      'value', coalesce(sum(value), 0),
      'value_after_tax', coalesce(sum(value_after_tax), 0),
      'untradeable_value', coalesce(sum(price * (quantity - tradeable_quantity)) FILTER (WHERE quantity > tradeable_quantity), 0)
    ) FROM rows),
    'cards', coalesce((SELECT jsonb_agg(to_jsonb(rows) - 'source_updated_at' ORDER BY (tradeable_quantity > 0) DESC, value DESC NULLS LAST, price DESC NULLS LAST, overall DESC, player_name)
      FROM rows), '[]'::JSONB)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION fut.club_trade_value(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.club_trade_value(UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
