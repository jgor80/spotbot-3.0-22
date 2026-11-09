-- My Account: the user's own EA account as the XI Lab helper copied it from answers the EA Web App already loaded
-- (coins, FC Points and other currencies, club record, transfer list, watchlist, unassigned pile, SBCs, objectives,
-- season progress). One row per user and platform, each section with the time the Web App showed it, plus a small
-- balance history for the coins chart. Private to the owner via fut-api (service role only).

CREATE TABLE fut.account_state (
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform       TEXT NOT NULL CHECK (platform IN ('console', 'pc')),
  balance        JSONB, balance_at    TIMESTAMPTZ,
  profile        JSONB, profile_at    TIMESTAMPTZ,
  tradepile      JSONB, tradepile_at  TIMESTAMPTZ,
  watchlist      JSONB, watchlist_at  TIMESTAMPTZ,
  unassigned     JSONB, unassigned_at TIMESTAMPTZ,
  sbcs           JSONB, sbcs_at       TIMESTAMPTZ,
  objectives     JSONB, objectives_at TIMESTAMPTZ,
  season         JSONB, season_at     TIMESTAMPTZ,
  -- Field names (never values) the helper saw per answer, to check EA's FC 27 shape.
  shape          JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, platform)
);

CREATE TABLE fut.account_balance_history (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform     TEXT NOT NULL CHECK (platform IN ('console', 'pc')),
  at           TIMESTAMPTZ NOT NULL,
  coins        BIGINT CHECK (coins >= 0),
  points       INTEGER CHECK (points >= 0),
  draft_tokens INTEGER CHECK (draft_tokens >= 0),
  PRIMARY KEY (user_id, platform, at)
);

GRANT ALL ON fut.account_state, fut.account_balance_history TO service_role;
ALTER TABLE fut.account_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.account_balance_history ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: service role only.

-- Names and latest FUT.GG prices for a list of EA item ids (the cards on a user's transfer list, watchlist and
-- unassigned pile). Nothing here is per-user: catalogue cards and public prices only.
CREATE OR REPLACE FUNCTION fut.account_item_prices(p_platform TEXT, p_ids BIGINT[])
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, fut SET enable_nestloop = off AS $$
DECLARE latest TIMESTAMPTZ; result JSONB;
BEGIN
  IF p_platform NOT IN ('console', 'pc') THEN RAISE EXCEPTION 'platform must be console or pc'; END IF;
  IF coalesce(cardinality(p_ids), 0) > 2000 THEN RAISE EXCEPTION 'at most 2000 ids'; END IF;
  SELECT max(published_at) INTO latest FROM fut.futgg_snapshots WHERE game_year = 27 AND platform = p_platform;
  WITH ids AS MATERIALIZED (
    SELECT DISTINCT unnest(coalesce(p_ids, '{}'::BIGINT[])) AS ea_item_id
  ), cards AS MATERIALIZED (
    SELECT DISTINCT ON (c.source_card_key) c.source_card_key::BIGINT AS ea_item_id, c.id, c.player_name, c.version, c.overall, c.positions[1] AS position
    FROM fut.player_cards c
    WHERE c.owner_user_id IS NULL AND c.source_id = 'futgg_catalogue' AND c.source_card_key IN (SELECT ea_item_id::TEXT FROM ids)
    ORDER BY c.source_card_key, c.id
  ), prices AS MATERIALIZED (
    SELECT f.ea_item_id, f.price FROM fut.futgg_prices f
    WHERE latest IS NOT NULL AND f.game_year = 27 AND f.platform = p_platform AND f.published_at = latest AND f.price IS NOT NULL
      AND f.ea_item_id IN (SELECT ea_item_id FROM ids)
  )
  SELECT jsonb_build_object('platform', p_platform, 'published_at', latest,
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object('ea_item_id', ids.ea_item_id, 'card_id', cards.id, 'player_name', cards.player_name,
        'version', cards.version, 'overall', cards.overall, 'position', cards.position, 'price', prices.price) ORDER BY ids.ea_item_id)
      FROM ids LEFT JOIN cards ON cards.ea_item_id = ids.ea_item_id LEFT JOIN prices ON prices.ea_item_id = ids.ea_item_id
      WHERE cards.id IS NOT NULL OR prices.price IS NOT NULL), '[]'::JSONB)) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION fut.account_item_prices(TEXT, BIGINT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.account_item_prices(TEXT, BIGINT[]) TO service_role;

NOTIFY pgrst, 'reload schema';
