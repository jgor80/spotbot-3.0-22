-- Knowledge Bank for my team (Jeff, 2026-11-12: "make it so i can see how these knowledge base articles would apply to
-- my team and take the overall knowledge bank sentiment and give me ideal formation, tactic and players the community
-- is talking about ... a list of players at each position"). Three read-only helpers for knowledge-team.ts:
--   kb_source_claims  one source (an "article") with its claims, for "how does this apply to my team"
--   kb_consensus      the formation, tactics, PlayStyle and player topics of the period with their strongest claims
--   kb_player_cards   the market-wide card list's cards for player names people talk about, with price and owned
-- Service role only, like the rest of the fut schema.

-- Lower case without accents, so "Mbappe" finds "Mbappé" (the web app sends names folded the same way).
CREATE OR REPLACE FUNCTION fut.kb_fold(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT translate(lower(coalesce(p, '')), 'áàâäãåāăąéèêëēėęěíìîïīįóòôöõøōőúùûüūůűųñńçćčšśžźżđýÿłğış',
    'aaaaaaaaaeeeeeeeeiiiiiioooooooouuuuuuuunncccsszzzdyylgis');
$$;

-- One source the user may see, with its claims (strongest first). NULL when it doesn't exist or is someone else's.
CREATE OR REPLACE FUNCTION fut.kb_source_claims(p_user UUID, p_source UUID)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  SELECT jsonb_build_object(
    'source', jsonb_build_object('id', s.id, 'kind', s.kind, 'url', s.url, 'title', s.title, 'community', s.community, 'score', s.score,
      'published_at', s.published_at, 'note', s.note, 'mine', s.added_by IS NOT DISTINCT FROM p_user AND s.added_by IS NOT NULL),
    'claims', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'topic_key', c.topic_key, 'topic', c.topic, 'category', c.category,
        'statement', c.statement, 'stance', c.stance, 'strength', c.strength, 'said_at', c.said_at) ORDER BY c.strength DESC, c.id)
      FROM fut.kb_claims c WHERE c.source_id = s.id), '[]'::JSONB))
  FROM fut.kb_sources s
  WHERE s.id = p_source AND (s.shared OR (p_user IS NOT NULL AND s.added_by = p_user));
$$;

-- The community's view for a game plan: every formation, tactics, PlayStyle and player topic of the last p_days (up to
-- p_per a category, most talked about first) with its totals and its p_statements strongest claims and their sources.
CREATE OR REPLACE FUNCTION fut.kb_consensus(p_user UUID, p_days INTEGER DEFAULT 30, p_per INTEGER DEFAULT 30, p_statements INTEGER DEFAULT 4)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  WITH win AS (SELECT least(greatest(coalesce(p_days, 30), 1), 365) AS days),
  c AS (
    SELECT v.* FROM win, fut.kb_visible_claims(p_user, now() - make_interval(days => win.days)) v
    WHERE v.category IN ('formations', 'tactics', 'players', 'playstyles')
  ),
  t AS (
    SELECT topic_key,
      (array_agg(topic ORDER BY said_at DESC))[1] AS topic,
      mode() WITHIN GROUP (ORDER BY category) AS category,
      count(*) AS claims, count(DISTINCT source_id) AS sources,
      coalesce(sum(weight) FILTER (WHERE stance = 1), 0) AS w_for,
      coalesce(sum(weight) FILTER (WHERE stance = -1), 0) AS w_against,
      coalesce(sum(weight) FILTER (WHERE stance = 0), 0) AS w_mixed,
      count(*) FILTER (WHERE stance = 1) AS n_for, count(*) FILTER (WHERE stance = -1) AS n_against, count(*) FILTER (WHERE stance = 0) AS n_mixed,
      sum(weight) AS buzz, max(said_at) AS last_said
    FROM c GROUP BY topic_key
  ),
  ranked AS (SELECT t.*, row_number() OVER (PARTITION BY category ORDER BY buzz DESC, topic_key) AS rn FROM t)
  SELECT jsonb_build_object(
    'days', (SELECT days FROM win),
    'claims', (SELECT count(*) FROM c),
    'sources', (SELECT count(DISTINCT source_id) FROM c),
    'topics', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'key', r.topic_key, 'topic', r.topic, 'category', r.category, 'claims', r.claims, 'sources', r.sources,
        'for', r.n_for, 'against', r.n_against, 'mixed', r.n_mixed, 'buzz', round(r.buzz, 2),
        'net', round(((r.w_for - r.w_against) / nullif(r.w_for + r.w_against + r.w_mixed, 0))::NUMERIC, 3),
        'agreement', fut.kb_agreement(r.claims, r.w_for, r.w_against, r.w_mixed),
        'last_said', r.last_said,
        'statements', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'statement', x.statement, 'stance', x.stance, 'weight', x.weight,
            'said_at', x.said_at, 'source', jsonb_build_object('id', s.id, 'kind', s.kind, 'url', s.url, 'title', s.title, 'community', s.community))
            ORDER BY x.weight DESC, x.said_at DESC), '[]'::JSONB)
          FROM (SELECT * FROM c WHERE c.topic_key = r.topic_key ORDER BY weight DESC, said_at DESC
            LIMIT least(greatest(coalesce(p_statements, 4), 1), 10)) x
          JOIN fut.kb_sources s ON s.id = x.source_id))
      ORDER BY r.category, r.buzz DESC, r.topic_key)
      FROM ranked r WHERE r.rn <= least(greatest(coalesce(p_per, 30), 1), 60)), '[]'::JSONB)
  );
$$;

-- Cards on the market-wide list for the names people talk about. p_names: [{key, name, last}] with name and last
-- already folded (kb_fold). Each name gets its best cards by overall (up to 4), matched on the full name, or on the
-- last name when the full name finds nothing; price from the latest FUT.GG snapshot for the platform, owned when the
-- user's club has that card.
CREATE OR REPLACE FUNCTION fut.kb_player_cards(p_user UUID, p_names JSONB, p_platform TEXT DEFAULT 'console')
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  WITH latest AS (
    SELECT max(published_at) AS at FROM fut.futgg_snapshots WHERE game_year = 27 AND platform = coalesce(p_platform, 'console')
  ), names AS (
    SELECT x.key, x.name, nullif(x.last, '') AS last
    FROM jsonb_to_recordset(CASE WHEN jsonb_typeof(p_names) = 'array' THEN p_names ELSE '[]' END) AS x(key TEXT, name TEXT, last TEXT)
    WHERE length(coalesce(x.name, '')) BETWEEN 3 AND 80 LIMIT 60
  ), cat AS MATERIALIZED (
    SELECT c.id, c.player_name, fut.kb_fold(c.player_name) AS folded, c.version, c.overall, c.positions, c.source_card_key,
      coalesce(a.alt_positions, '{}') AS alt_positions
    FROM fut.player_cards c LEFT JOIN fut.card_attributes a ON a.card_id = c.id
    WHERE c.owner_user_id IS NULL AND c.source_id = 'futgg_catalogue'
  ), hits AS (
    SELECT n.key, cat.*, 'name' AS matched FROM names n JOIN cat ON cat.folded LIKE '%' || n.name || '%'
    UNION ALL
    SELECT n.key, cat.*, 'last' FROM names n JOIN cat ON n.last IS NOT NULL AND length(n.last) >= 4
      AND cat.folded ~ ('(^|[^a-z])' || regexp_replace(n.last, '([^a-z0-9 ])', '\\\1', 'g') || '($|[^a-z])')
      AND NOT EXISTS (SELECT 1 FROM cat c2 WHERE c2.folded LIKE '%' || n.name || '%')
  ), mine AS (
    SELECT DISTINCT source_card_key AS key FROM fut.player_cards WHERE p_user IS NOT NULL AND owner_user_id = p_user AND source_card_key IS NOT NULL
  ), priced AS (
    SELECT h.*, p.price, (m.key IS NOT NULL) AS owned,
      row_number() OVER (PARTITION BY h.key ORDER BY (m.key IS NOT NULL) DESC, h.overall DESC, p.price ASC NULLS LAST, h.id) AS rn
    FROM hits h
    LEFT JOIN fut.futgg_prices p ON p.ea_item_id::TEXT = h.source_card_key AND p.game_year = 27 AND p.platform = coalesce(p_platform, 'console')
      AND p.published_at = (SELECT at FROM latest)
    LEFT JOIN mine m ON m.key = h.source_card_key
  )
  SELECT coalesce(jsonb_object_agg(key, cards), '{}'::JSONB) FROM (
    SELECT key, jsonb_agg(jsonb_build_object('id', id, 'player_name', player_name, 'version', version, 'overall', overall,
      'position', positions[1], 'alt_positions', alt_positions, 'price', price, 'owned', owned, 'matched', matched,
      'ea_item_id', CASE WHEN source_card_key ~ '^\d{1,10}$' THEN source_card_key::BIGINT END) ORDER BY rn) AS cards
    FROM priced WHERE rn <= 4 GROUP BY key
  ) g;
$$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['kb_fold(TEXT)', 'kb_source_claims(UUID, UUID)', 'kb_consensus(UUID, INTEGER, INTEGER, INTEGER)', 'kb_player_cards(UUID, JSONB, TEXT)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION fut.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION fut.%s TO service_role', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
