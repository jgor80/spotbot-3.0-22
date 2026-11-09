-- Player Ratings and the player finder: full stats for every card on the market-wide card list, and one search that
-- filters, sorts and ranks by any stat. Stats come from FUT.GG's card pages, fetched a few hundred at a time by the
-- bot's scheduler (fut-api job "futgg-attributes"). Service role only, like the rest of the catalogue.

UPDATE fut.data_sources SET terms_notes = 'Public files: FUT.GG''s card pool (rating, position, club, nation, league, card type) and the EA FC Web App''s player name file, read twice a day; plus FUT.GG''s card pages (face stats, in-game attributes, PlayStyles, Roles) read a few hundred cards at a time. Not an EA or FUT.GG licence. Shared read-only catalogue cards.'
WHERE id = 'futgg_catalogue';

-- Card facts that aren't attributes. alt_positions are the card's other positions (primary stays in player_cards).
ALTER TABLE fut.card_attributes
  ADD COLUMN IF NOT EXISTS foot TEXT CHECK (foot IN ('left', 'right')),
  ADD COLUMN IF NOT EXISTS height_cm SMALLINT CHECK (height_cm BETWEEN 140 AND 220),
  ADD COLUMN IF NOT EXISTS accelerate_type TEXT CHECK (length(accelerate_type) <= 30),
  ADD COLUMN IF NOT EXISTS alt_positions TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(alt_positions) <= 4),
  ADD COLUMN IF NOT EXISTS total_igs SMALLINT CHECK (total_igs BETWEEN 1 AND 4000),
  ADD COLUMN IF NOT EXISTS is_dynamic BOOLEAN NOT NULL DEFAULT false,
  -- When the FUT.GG download last looked at the card (also set when FUT.GG had no page for it).
  ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ;

-- Which catalogue cards to fetch next: never fetched first (market cards and higher ratings first), then dynamic
-- cards not fetched for 3 days, then anything not fetched for 30 days.
CREATE OR REPLACE FUNCTION fut.futgg_attribute_queue(p_limit INTEGER DEFAULT 1200)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  WITH due AS (
    SELECT c.source_card_key::BIGINT AS id, c.market_tracked, c.overall,
      CASE WHEN a.fetched_at IS NULL THEN 0 WHEN a.is_dynamic AND a.fetched_at < now() - interval '3 days' THEN 1 ELSE 2 END AS tier
    FROM fut.player_cards c LEFT JOIN fut.card_attributes a ON a.card_id = c.id
    WHERE c.owner_user_id IS NULL AND c.source_id = 'futgg_catalogue' AND c.source_card_key ~ '^[0-9]{1,12}$'
      AND (a.fetched_at IS NULL OR (a.is_dynamic AND a.fetched_at < now() - interval '3 days') OR a.fetched_at < now() - interval '30 days')
  )
  SELECT jsonb_build_object(
    'waiting', (SELECT count(*) FROM due),
    'ids', coalesce((SELECT jsonb_agg(id ORDER BY tier, market_tracked DESC, overall DESC, id)
      FROM (SELECT * FROM due ORDER BY tier, market_tracked DESC, overall DESC, id LIMIT least(greatest(coalesce(p_limit, 1200), 1), 5000)) x), '[]'::JSONB));
$$;

-- The download's rows matched to their catalogue cards.
CREATE OR REPLACE FUNCTION fut.futgg_attribute_rows(p_cards JSONB)
RETURNS TABLE (card_id UUID, found BOOLEAN, pac SMALLINT, sho SMALLINT, pas SMALLINT, dri SMALLINT, def SMALLINT, phy SMALLINT,
  detail JSONB, skill_moves SMALLINT, weak_foot SMALLINT, foot TEXT, height_cm SMALLINT, accelerate_type TEXT, alt_positions TEXT[],
  total_igs SMALLINT, is_dynamic BOOLEAN, playstyles JSONB, playstyles_plus JSONB, roles JSONB)
LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  SELECT c.id, coalesce(x.found, true), x.pac, x.sho, x.pas, x.dri, x.def, x.phy,
    coalesce((SELECT jsonb_object_agg(k, v) FROM jsonb_each(coalesce(x.detail, '{}')) AS e(k, v)
      WHERE k ~ '^[a-z_]{2,30}$' AND jsonb_typeof(v) = 'number' AND (v #>> '{}')::NUMERIC BETWEEN 1 AND 99), '{}'::JSONB),
    x.skill_moves, x.weak_foot, x.foot, x.height_cm, left(x.accelerate_type, 30),
    ARRAY(SELECT p FROM jsonb_array_elements_text(coalesce(x.alt_positions, '[]')) p WHERE p IN (SELECT code FROM fut.positions) LIMIT 4),
    x.total_igs, coalesce(x.is_dynamic, false), coalesce(x.playstyles, '[]'), coalesce(x.playstyles_plus, '[]'), coalesce(x.roles, '[]')
  FROM jsonb_to_recordset(p_cards) AS x(ea_item_id BIGINT, found BOOLEAN, pac SMALLINT, sho SMALLINT, pas SMALLINT, dri SMALLINT,
    def SMALLINT, phy SMALLINT, detail JSONB, skill_moves SMALLINT, weak_foot SMALLINT, foot TEXT, height_cm SMALLINT, accelerate_type TEXT,
    alt_positions JSONB, total_igs SMALLINT, is_dynamic BOOLEAN, playstyles JSONB, playstyles_plus JSONB, roles JSONB)
  JOIN fut.player_cards c ON c.owner_user_id IS NULL AND c.source_id = 'futgg_catalogue' AND c.source_card_key = x.ea_item_id::TEXT;
$$;

-- Saves one batch of downloaded stats. A card FUT.GG had no page for keeps its old stats and is only marked as looked at.
CREATE OR REPLACE FUNCTION fut.upsert_futgg_attributes(p_cards JSONB)
RETURNS INTEGER LANGUAGE plpgsql SET search_path = pg_catalog, fut AS $$
DECLARE n INTEGER;
BEGIN
  IF jsonb_typeof(p_cards) IS DISTINCT FROM 'array' OR jsonb_array_length(p_cards) > 500 THEN
    RAISE EXCEPTION 'Stats batch must be an array of at most 500 cards';
  END IF;
  INSERT INTO fut.card_attributes AS a (card_id, pac, sho, pas, dri, def, phy, detail, foot, height_cm, accelerate_type, alt_positions,
    total_igs, is_dynamic, fetched_at)
  SELECT r.card_id, r.pac, r.sho, r.pas, r.dri, r.def, r.phy, r.detail, r.foot, r.height_cm, r.accelerate_type, r.alt_positions,
    r.total_igs, r.is_dynamic, now()
  FROM fut.futgg_attribute_rows(p_cards) r WHERE r.found
  ON CONFLICT (card_id) DO UPDATE SET pac = EXCLUDED.pac, sho = EXCLUDED.sho, pas = EXCLUDED.pas, dri = EXCLUDED.dri, def = EXCLUDED.def,
    phy = EXCLUDED.phy, detail = EXCLUDED.detail, foot = EXCLUDED.foot, height_cm = EXCLUDED.height_cm, accelerate_type = EXCLUDED.accelerate_type,
    alt_positions = EXCLUDED.alt_positions, total_igs = EXCLUDED.total_igs, is_dynamic = EXCLUDED.is_dynamic, fetched_at = now();
  -- Cards FUT.GG had no page for: only mark them as looked at
  INSERT INTO fut.card_attributes AS a (card_id, fetched_at)
  SELECT r.card_id, now() FROM fut.futgg_attribute_rows(p_cards) r WHERE NOT r.found
  ON CONFLICT (card_id) DO UPDATE SET fetched_at = now();

  UPDATE fut.player_cards c SET skill_moves = r.skill_moves, weak_foot = r.weak_foot, updated_at = now()
  FROM fut.futgg_attribute_rows(p_cards) r
  WHERE c.id = r.card_id AND r.found AND (c.skill_moves, c.weak_foot) IS DISTINCT FROM (r.skill_moves, r.weak_foot);

  DELETE FROM fut.card_playstyles s USING fut.futgg_attribute_rows(p_cards) r WHERE s.card_id = r.card_id AND r.found;
  INSERT INTO fut.card_playstyles (card_id, name, is_plus)
  SELECT DISTINCT ON (r.card_id, p.name) r.card_id, left(p.name, 40), p.is_plus
  FROM fut.futgg_attribute_rows(p_cards) r,
    LATERAL (SELECT value AS name, true AS is_plus FROM jsonb_array_elements_text(r.playstyles_plus)
      UNION ALL SELECT value, false FROM jsonb_array_elements_text(r.playstyles)) p
  WHERE r.found AND length(trim(p.name)) > 0
  ORDER BY r.card_id, p.name, p.is_plus DESC;

  DELETE FROM fut.card_roles o USING fut.futgg_attribute_rows(p_cards) r WHERE o.card_id = r.card_id AND r.found;
  INSERT INTO fut.card_roles (card_id, position_code, role, level)
  SELECT DISTINCT ON (r.card_id, x.position, x.role) r.card_id, x.position, left(x.role, 40), x.level
  FROM fut.futgg_attribute_rows(p_cards) r,
    LATERAL jsonb_to_recordset(r.roles) AS x(position TEXT, role TEXT, level TEXT)
  WHERE r.found AND x.position IN (SELECT code FROM fut.positions) AND x.level IN ('plus', 'plusplus') AND length(trim(x.role)) > 0
  ORDER BY r.card_id, x.position, x.role, x.level DESC;

  SELECT count(*) INTO n FROM fut.futgg_attribute_rows(p_cards);
  RETURN n;
END;
$$;

-- One player search over the card list (Player Ratings and the finder chat). p_query is checked by fut-api first
-- (src/lib/futStats.ts cleanPlayerQuery); keys it doesn't know are ignored here too.
--   text, positions[], include_alt_positions, card_type, min/max_rating, min/max_price, priced_only,
--   minimums/maximums [{stat, value}], foot, playstyles[], playstyles_plus[], accelerate_types[], league, nation, club,
--   owned_only (cards in p_user's synced club), weights [{stat, weight}] (fit = weighted average), sort, direction,
--   platform, limit, offset.
CREATE OR REPLACE FUNCTION fut.futgg_player_search(p_query JSONB, p_user UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = pg_catalog, fut SET enable_nestloop = off AS $$
DECLARE
  keys CONSTANT TEXT[] := ARRAY['pac','sho','pas','dri','def','phy','acceleration','sprint_speed','positioning','finishing','shot_power',
    'long_shots','volleys','penalties','vision','crossing','fk_accuracy','short_passing','long_passing','curve','agility','balance',
    'reactions','ball_control','dribbling','composure','interceptions','heading_accuracy','defensive_awareness','standing_tackle',
    'sliding_tackle','jumping','stamina','strength','aggression','gk_diving','gk_handling','gk_kicking','gk_reflexes','gk_positioning',
    'gk_speed','overall','weak_foot','skill_moves','height_cm','total_stats','total_igs'];
  q JSONB := coalesce(p_query, '{}');
  plat TEXT := coalesce(q->>'platform', 'console');
  latest TIMESTAMPTZ;
  txt TEXT := nullif(lower(trim(q->>'text')), '');
  pos TEXT[] := ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(q->'positions') = 'array' THEN q->'positions' ELSE '[]' END));
  alt BOOLEAN := coalesce((q->>'include_alt_positions')::BOOLEAN, true);
  ctype TEXT := q->>'card_type';
  min_r INTEGER := (q->>'min_rating')::INTEGER; max_r INTEGER := (q->>'max_rating')::INTEGER;
  min_p INTEGER := (q->>'min_price')::INTEGER; max_p INTEGER := (q->>'max_price')::INTEGER;
  priced BOOLEAN := coalesce((q->>'priced_only')::BOOLEAN, false);
  mins JSONB := CASE WHEN jsonb_typeof(q->'minimums') = 'array' THEN q->'minimums' ELSE '[]' END;
  maxs JSONB := CASE WHEN jsonb_typeof(q->'maximums') = 'array' THEN q->'maximums' ELSE '[]' END;
  ft TEXT := q->>'foot';
  styles TEXT[] := ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(q->'playstyles') = 'array' THEN q->'playstyles' ELSE '[]' END));
  styles_plus TEXT[] := ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(q->'playstyles_plus') = 'array' THEN q->'playstyles_plus' ELSE '[]' END));
  accel TEXT[] := ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(q->'accelerate_types') = 'array' THEN q->'accelerate_types' ELSE '[]' END));
  lg TEXT := nullif(lower(trim(q->>'league')), ''); nat TEXT := nullif(lower(trim(q->>'nation')), ''); cl TEXT := nullif(lower(trim(q->>'club')), '');
  owned_only BOOLEAN := coalesce((q->>'owned_only')::BOOLEAN, false) AND p_user IS NOT NULL;
  weights JSONB := '[]';
  sort TEXT; dir TEXT;
  lim INTEGER := least(greatest(coalesce((q->>'limit')::INTEGER, 50), 1), 100);
  off INTEGER := greatest(coalesce((q->>'offset')::INTEGER, 0), 0);
  result JSONB;
BEGIN
  IF plat NOT IN ('console', 'pc') THEN RAISE EXCEPTION 'platform must be console or pc'; END IF;
  -- Only known stats count, so a bad key can't change the ranking or reach a cast
  SELECT coalesce(jsonb_agg(jsonb_build_object('stat', w->>'stat', 'weight', least(greatest((w->>'weight')::NUMERIC, 0), 5))), '[]')
    INTO weights FROM jsonb_array_elements(CASE WHEN jsonb_typeof(q->'weights') = 'array' THEN q->'weights' ELSE '[]' END) w
    WHERE w->>'stat' = ANY (keys) AND (w->>'weight') ~ '^[0-9]+(\.[0-9]+)?$';
  mins := coalesce((SELECT jsonb_agg(m) FROM jsonb_array_elements(mins) m WHERE m->>'stat' = ANY (keys) AND (m->>'value') ~ '^[0-9]{1,4}$'), '[]');
  maxs := coalesce((SELECT jsonb_agg(m) FROM jsonb_array_elements(maxs) m WHERE m->>'stat' = ANY (keys) AND (m->>'value') ~ '^[0-9]{1,4}$'), '[]');
  sort := coalesce(nullif(q->>'sort', ''), CASE WHEN jsonb_array_length(weights) > 0 THEN 'fit' ELSE 'overall' END);
  IF sort = 'fit' AND jsonb_array_length(weights) = 0 THEN sort := 'overall'; END IF;
  IF NOT (sort = ANY (keys) OR sort IN ('fit', 'price', 'name')) THEN RAISE EXCEPTION 'unknown sort'; END IF;
  dir := coalesce(nullif(q->>'direction', ''), CASE WHEN sort IN ('name', 'price') THEN 'asc' ELSE 'desc' END);
  IF dir NOT IN ('asc', 'desc') THEN RAISE EXCEPTION 'direction must be asc or desc'; END IF;
  SELECT max(published_at) INTO latest FROM fut.futgg_snapshots WHERE game_year = 27 AND platform = plat;

  WITH prices AS MATERIALIZED (
    SELECT ea_item_id::TEXT AS key, price FROM fut.futgg_prices
    WHERE latest IS NOT NULL AND game_year = 27 AND platform = plat AND published_at = latest AND price IS NOT NULL
  ), mine AS MATERIALIZED (
    SELECT DISTINCT source_card_key AS key FROM fut.player_cards
    WHERE p_user IS NOT NULL AND owner_user_id = p_user AND source_card_key IS NOT NULL
  ), base AS (
    SELECT c.id, c.player_name, c.version, c.overall, c.positions[1] AS position, coalesce(a.alt_positions, '{}') AS alt_positions,
      c.club, c.league, c.nation, c.is_icon, c.is_hero, c.market_tracked, c.source_card_key::BIGINT AS ea_item_id, p.price,
      c.skill_moves, c.weak_foot, a.foot, a.height_cm, a.accelerate_type, a.pac, a.sho, a.pas, a.dri, a.def, a.phy,
      (a.pac IS NOT NULL) AS has_stats, (mine.key IS NOT NULL) AS owned,
      coalesce(a.detail, '{}') || jsonb_strip_nulls(jsonb_build_object('pac', a.pac, 'sho', a.sho, 'pas', a.pas, 'dri', a.dri, 'def', a.def,
        'phy', a.phy, 'overall', c.overall, 'weak_foot', c.weak_foot, 'skill_moves', c.skill_moves, 'height_cm', a.height_cm,
        'total_stats', a.pac + a.sho + a.pas + a.dri + a.def + a.phy, 'total_igs', a.total_igs)) AS stats
    FROM fut.player_cards c
    LEFT JOIN fut.card_attributes a ON a.card_id = c.id
    LEFT JOIN prices p ON p.key = c.source_card_key
    LEFT JOIN mine ON mine.key = c.source_card_key
    WHERE c.owner_user_id IS NULL AND c.source_id = 'futgg_catalogue'
      AND (txt IS NULL OR lower(c.player_name) LIKE '%' || txt || '%' OR lower(coalesce(c.club, '')) LIKE '%' || txt || '%'
        OR lower(coalesce(c.nation, '')) LIKE '%' || txt || '%' OR lower(coalesce(c.league, '')) LIKE '%' || txt || '%'
        OR lower(coalesce(c.version, '')) LIKE '%' || txt || '%')
      AND (cardinality(pos) = 0 OR c.positions[1] = ANY (pos) OR (alt AND coalesce(a.alt_positions, '{}') && pos))
      AND (ctype IS NULL OR (ctype = 'icon' AND c.is_icon) OR (ctype = 'hero' AND c.is_hero)
        OR (ctype = 'base' AND NOT c.is_icon AND NOT c.is_hero AND lower(coalesce(c.version, '')) IN ('rare', 'common', ''))
        OR (ctype = 'promo' AND NOT c.is_icon AND NOT c.is_hero AND lower(coalesce(c.version, '')) NOT IN ('rare', 'common', '')))
      AND (min_r IS NULL OR c.overall >= min_r) AND (max_r IS NULL OR c.overall <= max_r)
      AND (NOT priced OR p.price IS NOT NULL)
      AND (min_p IS NULL OR p.price >= min_p) AND (max_p IS NULL OR p.price <= max_p)
      AND (ft IS NULL OR a.foot = ft)
      AND (cardinality(accel) = 0 OR a.accelerate_type = ANY (accel))
      AND (lg IS NULL OR lower(coalesce(c.league, '')) LIKE '%' || lg || '%')
      AND (nat IS NULL OR lower(coalesce(c.nation, '')) LIKE '%' || nat || '%')
      AND (cl IS NULL OR lower(coalesce(c.club, '')) LIKE '%' || cl || '%')
      AND (NOT owned_only OR mine.key IS NOT NULL)
  ), filtered AS (
    SELECT base.* FROM base
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(mins) m WHERE coalesce((base.stats->>(m->>'stat'))::NUMERIC, -1) < (m->>'value')::NUMERIC)
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(maxs) m WHERE coalesce((base.stats->>(m->>'stat'))::NUMERIC, 100000) > (m->>'value')::NUMERIC)
      AND (cardinality(styles) = 0 OR (SELECT count(DISTINCT s.name) FROM fut.card_playstyles s WHERE s.card_id = base.id AND s.name = ANY (styles)) = cardinality(styles))
      AND (cardinality(styles_plus) = 0 OR (SELECT count(DISTINCT s.name) FROM fut.card_playstyles s WHERE s.card_id = base.id AND s.is_plus AND s.name = ANY (styles_plus)) = cardinality(styles_plus))
  ), scored AS (
    SELECT filtered.*,
      -- Fit: weighted average on a 1-99 scale (weak foot and skill moves count 20 a star; height 2 a cm over 150)
      (SELECT round(sum((w->>'weight')::NUMERIC * coalesce(CASE w->>'stat'
          WHEN 'weak_foot' THEN (filtered.stats->>'weak_foot')::NUMERIC * 20
          WHEN 'skill_moves' THEN (filtered.stats->>'skill_moves')::NUMERIC * 20
          WHEN 'height_cm' THEN least(99, greatest(1, ((filtered.stats->>'height_cm')::NUMERIC - 150) * 2))
          WHEN 'total_stats' THEN (filtered.stats->>'total_stats')::NUMERIC / 6
          WHEN 'total_igs' THEN (filtered.stats->>'total_igs')::NUMERIC / 34
          ELSE (filtered.stats->>(w->>'stat'))::NUMERIC END, 0)) / nullif(sum((w->>'weight')::NUMERIC), 0), 1)
        FROM jsonb_array_elements(weights) w) AS fit
    FROM filtered
    -- Ranking by fit only makes sense for cards whose stats are in
    WHERE jsonb_array_length(weights) = 0 OR filtered.has_stats
  ), keyed AS (
    SELECT scored.*, CASE WHEN sort = 'fit' THEN fit WHEN sort = 'price' THEN price::NUMERIC WHEN sort = 'name' THEN NULL
      ELSE (stats->>sort)::NUMERIC END AS sort_value FROM scored
  ), ranked AS (
    SELECT keyed.*, row_number() OVER (ORDER BY
      CASE WHEN sort = 'name' AND dir = 'asc' THEN player_name END ASC,
      CASE WHEN sort = 'name' AND dir = 'desc' THEN player_name END DESC,
      CASE WHEN dir = 'desc' THEN sort_value END DESC NULLS LAST,
      CASE WHEN dir = 'asc' THEN sort_value END ASC NULLS LAST,
      overall DESC, price ASC NULLS LAST, id) AS rn
    FROM keyed
  ), page AS (
    SELECT * FROM ranked WHERE rn > off AND rn <= off + lim
  )
  SELECT jsonb_build_object(
    'platform', plat, 'published_at', latest, 'sort', sort, 'direction', dir,
    'catalogue_cards', (SELECT count(*) FROM fut.player_cards WHERE owner_user_id IS NULL AND source_id = 'futgg_catalogue'),
    'with_stats', (SELECT count(*) FROM fut.player_cards c JOIN fut.card_attributes a ON a.card_id = c.id
      WHERE c.owner_user_id IS NULL AND c.source_id = 'futgg_catalogue' AND a.pac IS NOT NULL),
    'total', (SELECT count(*) FROM ranked),
    'cards', coalesce((SELECT jsonb_agg(to_jsonb(page) - 'rn' - 'sort_value' || jsonb_build_object(
        'playstyles', coalesce((SELECT jsonb_agg(s.name ORDER BY s.name) FROM fut.card_playstyles s WHERE s.card_id = page.id AND NOT s.is_plus), '[]'),
        'playstyles_plus', coalesce((SELECT jsonb_agg(s.name ORDER BY s.name) FROM fut.card_playstyles s WHERE s.card_id = page.id AND s.is_plus), '[]'),
        'roles', coalesce((SELECT jsonb_agg(jsonb_build_object('position', r.position_code, 'role', r.role, 'level', r.level) ORDER BY r.level DESC, r.position_code, r.role)
          FROM fut.card_roles r WHERE r.card_id = page.id), '[]')) ORDER BY rn) FROM page), '[]'::JSONB)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION fut.futgg_attribute_queue(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fut.futgg_attribute_rows(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fut.upsert_futgg_attributes(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fut.futgg_player_search(JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.futgg_attribute_queue(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION fut.futgg_attribute_rows(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION fut.upsert_futgg_attributes(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION fut.futgg_player_search(JSONB, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
