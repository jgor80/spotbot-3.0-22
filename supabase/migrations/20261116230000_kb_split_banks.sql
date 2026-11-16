-- Knowledge Bank split (Jeff, 2026-11-16: "can we separate the fut knowledge bank from the pro clubs knowledge bank,
-- at least in display between the two sides of the app"). Ultimate Team sources and claims show on the FUT side
-- (/fut/knowledge), Pro Clubs build sources and builds on the Club side (/knowledge). The source list and the status
-- take the bank (area); null keeps the old behaviour (both). Claims only ever come from Ultimate Team sources.

DROP FUNCTION IF EXISTS fut.kb_source_list(UUID, BOOLEAN, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION fut.kb_source_list(p_user UUID, p_mine BOOLEAN DEFAULT false, p_limit INTEGER DEFAULT 30, p_offset INTEGER DEFAULT 0, p_area TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  WITH s AS (SELECT * FROM fut.kb_sources WHERE CASE WHEN p_mine THEN added_by = p_user ELSE shared OR added_by = p_user END
    AND (p_area IS NULL OR area = p_area))
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM s),
    'sources', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', x.id, 'kind', x.kind, 'url', x.url, 'title', x.title, 'community', x.community, 'author', x.author, 'excerpt', x.excerpt,
        'published_at', x.published_at, 'collected_at', x.collected_at, 'score', x.score, 'comments', x.comments,
        'status', CASE WHEN x.status = 'reading' AND x.reading_at < now() - interval '15 minutes' THEN 'pending' ELSE x.status END,
        'reading_at', x.reading_at, 'note', x.note,
        'shared', x.shared, 'mine', x.added_by IS NOT DISTINCT FROM p_user AND x.added_by IS NOT NULL, 'area', x.area,
        'claims', (SELECT count(*) FROM fut.kb_claims c WHERE c.source_id = x.id) + (SELECT count(*) FROM fut.kb_builds b WHERE b.source_id = x.id))
        ORDER BY x.collected_at DESC, x.id)
      FROM (SELECT * FROM s ORDER BY collected_at DESC, id LIMIT least(greatest(coalesce(p_limit, 30), 1), 100) OFFSET greatest(coalesce(p_offset, 0), 0)) x), '[]'::JSONB));
$$;

DROP FUNCTION IF EXISTS fut.kb_status();
-- One bank's numbers (null: both). 'builds' counts Pro Clubs builds from shared sources.
CREATE OR REPLACE FUNCTION fut.kb_status(p_area TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  SELECT jsonb_build_object(
    'area', p_area,
    'sources', (SELECT count(*) FROM fut.kb_sources WHERE shared AND (p_area IS NULL OR area = p_area)),
    'claims', (SELECT count(*) FROM fut.kb_claims c JOIN fut.kb_sources s ON s.id = c.source_id WHERE s.shared AND (p_area IS NULL OR s.area = p_area)),
    'topics', (SELECT count(DISTINCT c.topic_key) FROM fut.kb_claims c JOIN fut.kb_sources s ON s.id = c.source_id WHERE s.shared AND (p_area IS NULL OR s.area = p_area)),
    'builds', (SELECT count(*) FROM fut.kb_builds b JOIN fut.kb_sources s ON s.id = b.source_id WHERE s.shared AND (p_area IS NULL OR s.area = p_area)),
    'waiting', (SELECT count(*) FROM fut.kb_sources WHERE fut.kb_is_waiting(status, reading_at, attempts, body, refetch) AND (p_area IS NULL OR area = p_area)),
    'reading', (SELECT count(*) FROM fut.kb_sources WHERE status = 'reading' AND reading_at >= now() - interval '15 minutes' AND (p_area IS NULL OR area = p_area)),
    'last_run', (SELECT to_jsonb(r) FROM fut.kb_runs r ORDER BY started_at DESC LIMIT 1),
    'last_success', (SELECT max(finished_at) FROM fut.kb_runs WHERE error IS NULL AND finished_at IS NOT NULL));
$$;

-- The map, topics, search and team plan read claims; make sure a Pro Clubs source can never feed them.
CREATE OR REPLACE FUNCTION fut.kb_no_claims_on_proclubs()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, fut AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM fut.kb_sources WHERE id = NEW.source_id AND area = 'proclubs') THEN RETURN NULL; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS kb_claims_fut_only ON fut.kb_claims;
CREATE TRIGGER kb_claims_fut_only BEFORE INSERT ON fut.kb_claims FOR EACH ROW EXECUTE FUNCTION fut.kb_no_claims_on_proclubs();

-- Clearer note on Pro Clubs sources the last migration couldn't re-read (they now show on the Pro Clubs side).
UPDATE fut.kb_sources SET note = 'This is a Pro Clubs build that was read as Ultimate Team; its text is gone, so paste it again here to read the builds.'
WHERE area = 'proclubs' AND note = 'This is a Pro Clubs build: add it again on the Pro Clubs side so it''s read into builds.';

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['kb_source_list(UUID, BOOLEAN, INTEGER, INTEGER, TEXT)', 'kb_status(TEXT)', 'kb_no_claims_on_proclubs()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION fut.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION fut.%s TO service_role', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
