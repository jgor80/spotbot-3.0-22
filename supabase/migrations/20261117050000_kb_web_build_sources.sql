-- Pro Clubs build guides read from sites that allow it (Jeff, 2026-11-17: "find more sources we can read and scrape
-- automatically"; supabase/functions/_shared/fut/build-web.ts). The collector can now store a web page ('web', id 'w' +
-- a hash of its URL), for the Pro Clubs bank only; Ultimate Team stays Reddit and YouTube.
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'fut.kb_sources'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%added_by IS NOT NULL%'
  LOOP
    EXECUTE format('ALTER TABLE fut.kb_sources DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE fut.kb_sources ADD CONSTRAINT kb_sources_collected_check
  CHECK (added_by IS NOT NULL OR (shared AND (kind IN ('reddit', 'youtube') OR (kind = 'web' AND area = 'proclubs'))));

CREATE OR REPLACE FUNCTION fut.kb_collect(p_sources JSONB)
RETURNS INTEGER LANGUAGE plpgsql SET search_path = pg_catalog, fut AS $$
DECLARE n INTEGER;
BEGIN
  IF jsonb_typeof(p_sources) IS DISTINCT FROM 'array' OR jsonb_array_length(p_sources) > 300 THEN
    RAISE EXCEPTION 'Sources must be an array of at most 300';
  END IF;
  WITH incoming AS (
    SELECT * FROM jsonb_to_recordset(p_sources) AS x(kind TEXT, external_id TEXT, url TEXT, title TEXT, author TEXT, community TEXT,
      published_at TIMESTAMPTZ, score INTEGER, comments INTEGER, body TEXT, excerpt TEXT, area TEXT)
    WHERE (x.kind IN ('reddit', 'youtube') OR (x.kind = 'web' AND x.area = 'proclubs'))
      AND x.external_id ~ '^[A-Za-z0-9_-]{1,40}$' AND x.url ~ '^https://[^\s]{4,}$' AND length(x.url) <= 600
      AND length(coalesce(x.body, '')) BETWEEN 20 AND 16000
  ), saved AS (
    INSERT INTO fut.kb_sources (kind, external_id, url, title, author, community, published_at, score, comments, body, excerpt, area)
    SELECT kind, external_id, url, left(title, 300), left(author, 100), left(community, 100), coalesce(published_at, now()),
      greatest(coalesce(score, 0), 0), greatest(coalesce(comments, 0), 0), body, left(excerpt, 600),
      CASE WHEN area = 'proclubs' THEN 'proclubs' ELSE 'fut' END
    FROM incoming
    ON CONFLICT (kind, external_id) WHERE external_id IS NOT NULL
    DO UPDATE SET score = greatest(fut.kb_sources.score, EXCLUDED.score), comments = greatest(fut.kb_sources.comments, EXCLUDED.comments)
    RETURNING (xmax = 0) AS inserted
  )
  SELECT count(*) FILTER (WHERE inserted) INTO n FROM saved;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION fut.kb_collect(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.kb_collect(JSONB) TO service_role;
