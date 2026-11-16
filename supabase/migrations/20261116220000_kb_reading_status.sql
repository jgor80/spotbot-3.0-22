-- Knowledge Bank: added sources are read in the background with a visible status (Jeff, 2026-11-16: "i just added
-- sources to the knowledge bank and it doesn't seem like they are ingested right away").
-- What went wrong: Pro Clubs build videos added on the Sources tab were read as Ultimate Team claims (that form never
-- sent area 'proclubs'), so they showed up on the FUT map as "... build (Clubs)" topics and never reached the Pro Clubs
-- builds. Separately, a source whose read failed or timed out sat at the back of a 3-hourly queue sorted by upvotes.
--   1. status 'reading' (with reading_at): a source someone added is being read right now. A read that never finished
--      (restart, crash) counts as waiting again after 15 minutes.
--   2. kb_pending claims what it hands out (status 'reading'), sources people added come first, and it can return only
--      those (the 10-minute queue job). kb_release puts claimed ones back when a run stops early.
--   3. refetch: a Reddit or YouTube source whose text was already dropped is fetched again before it's read.
--   4. kb_requeue, kb_retry, kb_set_area and kb_fetched for the service code; kb_source_list shows reading_at.
--   5. Sources people added whose claims are Pro Clubs builds move to the Pro Clubs side and are read again as builds.

ALTER TABLE fut.kb_sources ADD COLUMN IF NOT EXISTS reading_at TIMESTAMPTZ;
ALTER TABLE fut.kb_sources ADD COLUMN IF NOT EXISTS refetch BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE fut.kb_sources DROP CONSTRAINT IF EXISTS kb_sources_status_check;
ALTER TABLE fut.kb_sources ADD CONSTRAINT kb_sources_status_check CHECK (status IN ('pending', 'reading', 'read', 'skipped', 'failed'));
CREATE INDEX IF NOT EXISTS kb_sources_waiting ON fut.kb_sources (status) WHERE status IN ('pending', 'reading');

-- Waiting to be read: queued, or a read that started over 15 minutes ago and never finished.
CREATE OR REPLACE FUNCTION fut.kb_is_waiting(p_status TEXT, p_reading_at TIMESTAMPTZ, p_attempts INTEGER, p_body TEXT, p_refetch BOOLEAN)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT (p_status = 'pending' OR (p_status = 'reading' AND p_reading_at < now() - interval '15 minutes'))
    AND p_attempts < 3 AND (p_body IS NOT NULL OR p_refetch);
$$;

DROP FUNCTION IF EXISTS fut.kb_pending(INTEGER);
-- Hands out sources to read and marks them 'reading'. People's own sources first, then the most popular.
CREATE OR REPLACE FUNCTION fut.kb_pending(p_limit INTEGER DEFAULT 20, p_added_only BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE sql SET search_path = pg_catalog, fut AS $$
  WITH picked AS (
    SELECT id FROM fut.kb_sources
    WHERE fut.kb_is_waiting(status, reading_at, attempts, body, refetch) AND (NOT coalesce(p_added_only, false) OR added_by IS NOT NULL)
    ORDER BY (added_by IS NOT NULL) DESC, score DESC, collected_at
    LIMIT least(greatest(coalesce(p_limit, 20), 1), 100)
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE fut.kb_sources s SET status = 'reading', reading_at = now() FROM picked WHERE s.id = picked.id
    RETURNING s.id, s.kind, s.url, s.title, s.community, s.published_at, s.score, s.body, s.attempts, s.collected_at, s.area, s.refetch,
      (s.added_by IS NOT NULL) AS added
  )
  SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.added DESC, c.score DESC, c.collected_at), '[]'::JSONB) FROM claimed c;
$$;

-- Claimed sources a run didn't get to go back in the queue untouched.
CREATE OR REPLACE FUNCTION fut.kb_release(p_ids JSONB)
RETURNS INTEGER LANGUAGE sql SET search_path = pg_catalog, fut AS $$
  WITH r AS (UPDATE fut.kb_sources SET status = 'pending', reading_at = NULL
    WHERE jsonb_typeof(p_ids) = 'array' AND id::text IN (SELECT jsonb_array_elements_text(p_ids)) AND status = 'reading' RETURNING 1)
  SELECT count(*)::INTEGER FROM r;
$$;

-- Marks sources as being read now (a source someone just added).
CREATE OR REPLACE FUNCTION fut.kb_mark_reading(p_id UUID)
RETURNS JSONB LANGUAGE sql SET search_path = pg_catalog, fut AS $$
  UPDATE fut.kb_sources SET status = 'reading', reading_at = now(), note = NULL WHERE id = p_id
  RETURNING jsonb_build_object('id', id, 'kind', kind, 'url', url, 'body', body, 'area', area, 'refetch', refetch, 'added', added_by IS NOT NULL);
$$;

-- The reader couldn't run at all (no key, out of credit): back in the queue with the reason, no attempt counted.
CREATE OR REPLACE FUNCTION fut.kb_requeue(p_source UUID, p_note TEXT)
RETURNS VOID LANGUAGE sql SET search_path = pg_catalog, fut AS $$
  UPDATE fut.kb_sources SET status = 'pending', reading_at = NULL, note = left(p_note, 300) WHERE id = p_source AND status IN ('pending', 'reading');
$$;

-- "Try again" on one of the user's own sources that failed or is stuck waiting. Returns what to read, or null.
CREATE OR REPLACE FUNCTION fut.kb_retry(p_user UUID, p_id UUID)
RETURNS JSONB LANGUAGE sql SET search_path = pg_catalog, fut AS $$
  UPDATE fut.kb_sources SET status = 'reading', reading_at = now(), attempts = 0, note = NULL,
    refetch = refetch OR (body IS NULL AND kind IN ('reddit', 'youtube'))
  WHERE id = p_id AND added_by = p_user AND status IN ('pending', 'reading', 'failed')
    AND (body IS NOT NULL OR refetch OR kind IN ('reddit', 'youtube'))
  RETURNING jsonb_build_object('id', id, 'kind', kind, 'url', url, 'body', body, 'area', area, 'refetch', refetch, 'added', true);
$$;

-- A source turned out to belong to the other bank: its claims or builds go, and it's read again there.
CREATE OR REPLACE FUNCTION fut.kb_set_area(p_source UUID, p_area TEXT)
RETURNS VOID LANGUAGE plpgsql SET search_path = pg_catalog, fut AS $$
BEGIN
  IF p_area NOT IN ('fut', 'proclubs') THEN RAISE EXCEPTION 'Unknown area %', p_area; END IF;
  DELETE FROM fut.kb_claims WHERE source_id = p_source;
  DELETE FROM fut.kb_builds WHERE source_id = p_source;
  UPDATE fut.kb_sources SET area = p_area WHERE id = p_source;
END;
$$;

-- A refetched source's text, ready to read.
CREATE OR REPLACE FUNCTION fut.kb_fetched(p_source UUID, p_body TEXT)
RETURNS VOID LANGUAGE sql SET search_path = pg_catalog, fut AS $$
  UPDATE fut.kb_sources SET body = p_body, refetch = false WHERE id = p_source;
$$;

-- As before; waiting counts stuck reads and sources to refetch too, and 'reading' is how many are being read now.
CREATE OR REPLACE FUNCTION fut.kb_status()
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  SELECT jsonb_build_object(
    'sources', (SELECT count(*) FROM fut.kb_sources WHERE shared),
    'claims', (SELECT count(*) FROM fut.kb_claims c JOIN fut.kb_sources s ON s.id = c.source_id WHERE s.shared),
    'topics', (SELECT count(DISTINCT c.topic_key) FROM fut.kb_claims c JOIN fut.kb_sources s ON s.id = c.source_id WHERE s.shared),
    'waiting', (SELECT count(*) FROM fut.kb_sources WHERE fut.kb_is_waiting(status, reading_at, attempts, body, refetch)),
    'reading', (SELECT count(*) FROM fut.kb_sources WHERE status = 'reading' AND reading_at >= now() - interval '15 minutes'),
    'last_run', (SELECT to_jsonb(r) FROM fut.kb_runs r ORDER BY started_at DESC LIMIT 1),
    'last_success', (SELECT max(finished_at) FROM fut.kb_runs WHERE error IS NULL AND finished_at IS NOT NULL));
$$;

-- As before, plus when a read started (a read that started over 15 minutes ago shows as waiting).
CREATE OR REPLACE FUNCTION fut.kb_source_list(p_user UUID, p_mine BOOLEAN DEFAULT false, p_limit INTEGER DEFAULT 30, p_offset INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  WITH s AS (SELECT * FROM fut.kb_sources WHERE CASE WHEN p_mine THEN added_by = p_user ELSE shared OR added_by = p_user END)
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

-- Sources people added that the Ultimate Team reader filed as Pro Clubs build talk ("... build (Clubs)" topics): moved
-- to the Pro Clubs side and read again as builds. Reddit and YouTube links are fetched again; pasted text whose copy is
-- already gone can't be, so it says to add it again on the Pro Clubs side.
WITH moved AS (
  SELECT s.id, s.kind, s.body FROM fut.kb_sources s
  WHERE s.added_by IS NOT NULL AND s.area = 'fut'
    AND (SELECT count(*) FILTER (WHERE c.topic ~* '\(clubs\M|pro ?clubs') * 2 >= greatest(count(*), 1) FROM fut.kb_claims c WHERE c.source_id = s.id)
)
UPDATE fut.kb_sources s SET area = 'proclubs', attempts = 0, reading_at = NULL,
  refetch = (m.body IS NULL AND m.kind IN ('reddit', 'youtube')),
  status = CASE WHEN m.body IS NOT NULL OR m.kind IN ('reddit', 'youtube') THEN 'pending' ELSE 'failed' END,
  note = CASE WHEN m.body IS NOT NULL OR m.kind IN ('reddit', 'youtube') THEN 'Moved to Pro Clubs builds; reading it again.'
    ELSE 'This is a Pro Clubs build: add it again on the Pro Clubs side so it''s read into builds.' END
FROM moved m WHERE s.id = m.id;
-- Pro Clubs sources never keep Ultimate Team claims.
DELETE FROM fut.kb_claims c USING fut.kb_sources s WHERE c.source_id = s.id AND s.area = 'proclubs';

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['kb_pending(INTEGER, BOOLEAN)', 'kb_release(JSONB)', 'kb_mark_reading(UUID)', 'kb_requeue(UUID, TEXT)', 'kb_retry(UUID, UUID)',
    'kb_set_area(UUID, TEXT)', 'kb_fetched(UUID, TEXT)', 'kb_status()', 'kb_source_list(UUID, BOOLEAN, INTEGER, INTEGER)',
    'kb_is_waiting(TEXT, TIMESTAMPTZ, INTEGER, TEXT, BOOLEAN)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION fut.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION fut.%s TO service_role', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
