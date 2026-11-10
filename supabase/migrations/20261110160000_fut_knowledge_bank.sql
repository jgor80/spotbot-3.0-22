-- Knowledge bank (Jeff, 2026-11-10): FUT gameplay and strategy knowledge gathered from the community, and a map of
-- what people are saying. Sources are Reddit posts with their top comments and YouTube videos with their top comments
-- (both through the official APIs, collected by the bot's scheduler), plus links, transcripts and notes users paste
-- in themselves. Claude reads each source into short claims ("4-2-3-1 (2) is the best formation right now") with a
-- topic, a category and a stance (for, against, mixed). The map, topic pages, search and the "Ask" chat all read
-- these tables through the functions below. Service role only, like the rest of the fut schema.
--
-- Terms: only a short excerpt and the link are kept for a collected source, and its title, author, excerpt and the
-- text sent to the reader are cleared 30 days after it was collected (kb_cleanup); the claims are our own paraphrases.
-- A user's own source is private unless they share it, and is deleted with their account.

CREATE TABLE IF NOT EXISTS fut.kb_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('reddit', 'youtube', 'web', 'note')),
  -- Reddit post id or YouTube video id, so a source is only collected once.
  external_id TEXT CHECK (external_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  url TEXT CHECK (url ~ '^https://[^\s]{4,}$' AND length(url) <= 600),
  title TEXT CHECK (length(title) <= 300),
  author TEXT CHECK (length(author) <= 100),
  -- Subreddit or YouTube channel.
  community TEXT CHECK (length(community) <= 100),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Upvotes for a Reddit post, views for a video; user sources are 0.
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  comments INTEGER NOT NULL DEFAULT 0 CHECK (comments >= 0),
  -- The text sent to the reader (post, top comments, description); dropped once it has been read.
  body TEXT CHECK (length(body) <= 16000),
  excerpt TEXT CHECK (length(excerpt) <= 600),
  added_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  shared BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'read', 'skipped', 'failed')),
  attempts SMALLINT NOT NULL DEFAULT 0,
  -- The reader's one-line summary, or why it skipped or failed.
  note TEXT CHECK (length(note) <= 300),
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  CHECK (added_by IS NOT NULL OR (shared AND kind IN ('reddit', 'youtube')))
);
CREATE UNIQUE INDEX IF NOT EXISTS kb_sources_external ON fut.kb_sources (kind, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS kb_sources_pending ON fut.kb_sources (score DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS kb_sources_added_by ON fut.kb_sources (added_by, collected_at DESC) WHERE added_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS fut.kb_claims (
  id BIGSERIAL PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES fut.kb_sources(id) ON DELETE CASCADE,
  topic_key TEXT NOT NULL CHECK (topic_key ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  topic TEXT NOT NULL CHECK (length(topic) BETWEEN 1 AND 80),
  category TEXT NOT NULL CHECK (category IN ('formations', 'tactics', 'players', 'playstyles', 'attacking', 'defending', 'skills', 'settings', 'modes', 'market', 'other')),
  statement TEXT NOT NULL CHECK (length(statement) BETWEEN 3 AND 300),
  -- 1: says the topic is good, strong, worth it; -1: bad, weak, overrated, nerfed; 0: mixed or plain information.
  stance SMALLINT NOT NULL CHECK (stance IN (-1, 0, 1)),
  -- How strongly and how widely it was said in the source (a passing remark 1, the post's main point or echoed by many comments 3).
  strength SMALLINT NOT NULL DEFAULT 1 CHECK (strength BETWEEN 1 AND 3),
  said_at TIMESTAMPTZ NOT NULL,
  search TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', topic || ' ' || statement)) STORED
);
CREATE INDEX IF NOT EXISTS kb_claims_source ON fut.kb_claims (source_id);
CREATE INDEX IF NOT EXISTS kb_claims_topic ON fut.kb_claims (topic_key, said_at DESC);
CREATE INDEX IF NOT EXISTS kb_claims_said ON fut.kb_claims (said_at DESC);
CREATE INDEX IF NOT EXISTS kb_claims_search ON fut.kb_claims USING GIN (search);

CREATE TABLE IF NOT EXISTS fut.kb_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  -- Per feed: { status: ok | off | failed, collected, error? }
  feeds JSONB NOT NULL DEFAULT '{}',
  read INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  error TEXT CHECK (length(error) <= 500)
);

GRANT ALL ON fut.kb_sources, fut.kb_claims, fut.kb_runs TO service_role;
GRANT ALL ON SEQUENCE fut.kb_claims_id_seq, fut.kb_runs_id_seq TO service_role;
ALTER TABLE fut.kb_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.kb_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.kb_runs ENABLE ROW LEVEL SECURITY;

-- How much one claim counts: its strength, lifted for popular sources (log of upvotes or views).
CREATE OR REPLACE FUNCTION fut.kb_weight(p_strength SMALLINT, p_score INTEGER)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT round(p_strength * (1 + least(2, log(10, greatest(coalesce(p_score, 0), 1)::NUMERIC) / 2)), 3);
$$;

-- Collected sources from the scheduler's feeds. A source already stored only gets its newer score.
CREATE OR REPLACE FUNCTION fut.kb_collect(p_sources JSONB)
RETURNS INTEGER LANGUAGE plpgsql SET search_path = pg_catalog, fut AS $$
DECLARE n INTEGER;
BEGIN
  IF jsonb_typeof(p_sources) IS DISTINCT FROM 'array' OR jsonb_array_length(p_sources) > 300 THEN
    RAISE EXCEPTION 'Sources must be an array of at most 300';
  END IF;
  WITH incoming AS (
    SELECT * FROM jsonb_to_recordset(p_sources) AS x(kind TEXT, external_id TEXT, url TEXT, title TEXT, author TEXT, community TEXT,
      published_at TIMESTAMPTZ, score INTEGER, comments INTEGER, body TEXT, excerpt TEXT)
    WHERE x.kind IN ('reddit', 'youtube') AND x.external_id ~ '^[A-Za-z0-9_-]{1,40}$' AND x.url ~ '^https://[^\s]{4,}$' AND length(x.url) <= 600
      AND length(coalesce(x.body, '')) BETWEEN 20 AND 16000
  ), saved AS (
    INSERT INTO fut.kb_sources (kind, external_id, url, title, author, community, published_at, score, comments, body, excerpt)
    SELECT kind, external_id, url, left(title, 300), left(author, 100), left(community, 100), coalesce(published_at, now()),
      greatest(coalesce(score, 0), 0), greatest(coalesce(comments, 0), 0), body, left(excerpt, 600)
    FROM incoming
    ON CONFLICT (kind, external_id) WHERE external_id IS NOT NULL
    DO UPDATE SET score = greatest(fut.kb_sources.score, EXCLUDED.score), comments = greatest(fut.kb_sources.comments, EXCLUDED.comments)
    RETURNING (xmax = 0) AS inserted
  )
  SELECT count(*) FILTER (WHERE inserted) INTO n FROM saved;
  RETURN n;
END;
$$;

-- What the reader should read next: most popular first, three tries each.
CREATE OR REPLACE FUNCTION fut.kb_pending(p_limit INTEGER DEFAULT 20)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.score DESC, x.collected_at), '[]'::JSONB) FROM (
    SELECT id, kind, url, title, community, published_at, score, body, attempts, collected_at FROM fut.kb_sources
    WHERE status = 'pending' AND attempts < 3 AND body IS NOT NULL
    ORDER BY score DESC, collected_at LIMIT least(greatest(coalesce(p_limit, 20), 1), 100)
  ) x;
$$;

-- The topic names already in use, so the reader files new claims under the same topics.
CREATE OR REPLACE FUNCTION fut.kb_known_topics(p_limit INTEGER DEFAULT 150)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('topic', topic, 'category', category) ORDER BY n DESC, topic), '[]'::JSONB) FROM (
    SELECT * FROM (
    SELECT DISTINCT ON (c.topic_key) c.topic, c.category, count(*) OVER (PARTITION BY c.topic_key) AS n
    FROM fut.kb_claims c JOIN fut.kb_sources s ON s.id = c.source_id
    WHERE s.shared AND c.said_at > now() - interval '90 days'
    ORDER BY c.topic_key, c.said_at DESC
  ) t0 ORDER BY n DESC, topic LIMIT least(greatest(coalesce(p_limit, 150), 1), 400)
  ) t;
$$;

-- Saves what the reader made of one source (replacing any earlier reading). status read | skipped | failed;
-- a failure leaves it pending for another try until its third.
CREATE OR REPLACE FUNCTION fut.kb_save_reading(p_source UUID, p_status TEXT, p_note TEXT, p_claims JSONB)
RETURNS INTEGER LANGUAGE plpgsql SET search_path = pg_catalog, fut AS $$
DECLARE n INTEGER := 0; said TIMESTAMPTZ;
BEGIN
  IF p_status NOT IN ('read', 'skipped', 'failed') THEN RAISE EXCEPTION 'Unknown reading status %', p_status; END IF;
  SELECT published_at INTO said FROM fut.kb_sources WHERE id = p_source FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF p_status = 'failed' THEN
    UPDATE fut.kb_sources SET attempts = attempts + 1, note = left(p_note, 300),
      status = CASE WHEN attempts + 1 >= 3 THEN 'failed' ELSE 'pending' END,
      body = CASE WHEN attempts + 1 >= 3 THEN NULL ELSE body END
    WHERE id = p_source;
    RETURN 0;
  END IF;
  DELETE FROM fut.kb_claims WHERE source_id = p_source;
  IF p_status = 'read' AND jsonb_typeof(p_claims) = 'array' THEN
    INSERT INTO fut.kb_claims (source_id, topic_key, topic, category, statement, stance, strength, said_at)
    SELECT p_source, x.topic_key, left(btrim(x.topic), 80), x.category, left(btrim(x.statement), 300), x.stance, coalesce(x.strength, 1), said
    FROM (SELECT * FROM jsonb_to_recordset(p_claims) AS r(topic_key TEXT, topic TEXT, category TEXT, statement TEXT, stance SMALLINT, strength SMALLINT) LIMIT 15) x
    WHERE x.topic_key ~ '^[a-z0-9][a-z0-9-]{0,79}$' AND length(btrim(coalesce(x.topic, ''))) > 0 AND length(btrim(coalesce(x.statement, ''))) >= 3
      AND x.category IN ('formations', 'tactics', 'players', 'playstyles', 'attacking', 'defending', 'skills', 'settings', 'modes', 'market', 'other')
      AND x.stance IN (-1, 0, 1) AND coalesce(x.strength, 1) BETWEEN 1 AND 3;
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  UPDATE fut.kb_sources SET status = CASE WHEN p_status = 'read' AND n = 0 THEN 'skipped' ELSE p_status END,
    note = left(p_note, 300), read_at = now(), attempts = attempts + 1, body = NULL
  WHERE id = p_source;
  RETURN n;
END;
$$;

-- A link, transcript or note a user pasted in. Returns the new source's id (or the existing one for a Reddit post or
-- video already in the bank).
CREATE OR REPLACE FUNCTION fut.kb_add(p_user UUID, p_source JSONB)
RETURNS UUID LANGUAGE plpgsql SET search_path = pg_catalog, fut AS $$
DECLARE r RECORD; new_id UUID;
BEGIN
  SELECT * INTO r FROM jsonb_to_record(p_source) AS x(kind TEXT, external_id TEXT, url TEXT, title TEXT, author TEXT, community TEXT,
    published_at TIMESTAMPTZ, score INTEGER, comments INTEGER, body TEXT, excerpt TEXT, shared BOOLEAN);
  IF r.external_id IS NOT NULL THEN
    SELECT id INTO new_id FROM fut.kb_sources WHERE kind = r.kind AND external_id = r.external_id AND (shared OR added_by = p_user);
    IF FOUND THEN RETURN new_id; END IF;
  END IF;
  INSERT INTO fut.kb_sources (kind, external_id, url, title, author, community, published_at, score, comments, body, excerpt, added_by, shared)
  VALUES (r.kind, r.external_id, r.url, left(r.title, 300), left(r.author, 100), left(r.community, 100), coalesce(r.published_at, now()),
    greatest(coalesce(r.score, 0), 0), greatest(coalesce(r.comments, 0), 0), r.body, left(r.excerpt, 600), p_user, coalesce(r.shared, false))
  ON CONFLICT (kind, external_id) WHERE external_id IS NOT NULL DO NOTHING
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- Deletes one of the user's own sources (and its claims). Collected sources can't be deleted this way.
CREATE OR REPLACE FUNCTION fut.kb_delete(p_user UUID, p_id UUID)
RETURNS BOOLEAN LANGUAGE sql SET search_path = pg_catalog, fut AS $$
  WITH gone AS (DELETE FROM fut.kb_sources WHERE id = p_id AND added_by = p_user RETURNING 1) SELECT EXISTS (SELECT 1 FROM gone);
$$;

-- The claims one user may see: everything shared plus their own private sources.
CREATE OR REPLACE FUNCTION fut.kb_visible_claims(p_user UUID, p_since TIMESTAMPTZ)
RETURNS TABLE (id BIGINT, source_id UUID, topic_key TEXT, topic TEXT, category TEXT, statement TEXT, stance SMALLINT, strength SMALLINT,
  said_at TIMESTAMPTZ, weight NUMERIC, kind TEXT, score INTEGER, mine BOOLEAN)
LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  SELECT c.id, c.source_id, c.topic_key, c.topic, c.category, c.statement, c.stance, c.strength, c.said_at,
    fut.kb_weight(c.strength, s.score), s.kind, s.score, s.added_by IS NOT DISTINCT FROM p_user AND s.added_by IS NOT NULL
  FROM fut.kb_claims c JOIN fut.kb_sources s ON s.id = c.source_id
  WHERE (s.shared OR (p_user IS NOT NULL AND s.added_by = p_user)) AND c.said_at >= p_since;
$$;

-- How sure people are: early (under 3 claims), agreed (70%+ one way), leaning (55%+), split.
CREATE OR REPLACE FUNCTION fut.kb_agreement(p_claims BIGINT, p_for NUMERIC, p_against NUMERIC, p_mixed NUMERIC)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN p_claims < 3 OR p_for + p_against + p_mixed = 0 THEN 'early'
    WHEN greatest(p_for, p_against) / (p_for + p_against + p_mixed) >= 0.7 THEN 'agreed'
    WHEN greatest(p_for, p_against) / (p_for + p_against + p_mixed) >= 0.55 THEN 'leaning'
    ELSE 'split' END;
$$;

-- The map: every topic talked about in the last p_days, with weighted for/against/mixed, net sentiment (-1..1),
-- agreement, and trend (-1..1: talk in the newer half of the window against the older half).
CREATE OR REPLACE FUNCTION fut.kb_map(p_user UUID, p_days INTEGER DEFAULT 30, p_category TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  WITH win AS (SELECT least(greatest(coalesce(p_days, 30), 1), 365) AS days),
  c AS (
    SELECT v.* FROM win, fut.kb_visible_claims(p_user, now() - make_interval(days => win.days)) v
    WHERE p_category IS NULL OR v.category = p_category
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
      sum(weight) AS buzz,
      coalesce(sum(weight) FILTER (WHERE said_at >= now() - make_interval(days => (SELECT days FROM win)) / 2), 0) AS recent,
      coalesce(sum(weight) FILTER (WHERE said_at < now() - make_interval(days => (SELECT days FROM win)) / 2), 0) AS earlier,
      max(said_at) AS last_said, bool_or(mine) AS has_mine
    FROM c GROUP BY topic_key
  )
  SELECT jsonb_build_object(
    'days', (SELECT days FROM win),
    'category', p_category,
    'claims', (SELECT count(*) FROM c),
    'sources', (SELECT count(DISTINCT source_id) FROM c),
    'topics', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'key', topic_key, 'topic', topic, 'category', category, 'claims', claims, 'sources', sources,
        'for', n_for, 'against', n_against, 'mixed', n_mixed,
        'buzz', round(buzz, 2),
        'net', round(((w_for - w_against) / nullif(w_for + w_against + w_mixed, 0))::NUMERIC, 3),
        'agreement', fut.kb_agreement(claims, w_for, w_against, w_mixed),
        'trend', round(((recent - earlier) / nullif(recent + earlier, 0))::NUMERIC, 3),
        'last_said', last_said, 'has_mine', has_mine) ORDER BY buzz DESC, topic_key)
      FROM (SELECT * FROM t ORDER BY buzz DESC, topic_key LIMIT 200) top), '[]'::JSONB)
  );
$$;

-- One topic: totals, a weekly series (for, against, mixed) and its claims with their sources.
CREATE OR REPLACE FUNCTION fut.kb_topic(p_user UUID, p_key TEXT, p_days INTEGER DEFAULT 90)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  WITH win AS (SELECT least(greatest(coalesce(p_days, 90), 7), 365) AS days),
  c AS (SELECT v.* FROM win, fut.kb_visible_claims(p_user, now() - make_interval(days => win.days)) v WHERE v.topic_key = p_key),
  tot AS (SELECT count(*) AS claims,
    coalesce(sum(weight) FILTER (WHERE stance = 1), 0) AS w_for, coalesce(sum(weight) FILTER (WHERE stance = -1), 0) AS w_against,
    coalesce(sum(weight) FILTER (WHERE stance = 0), 0) AS w_mixed FROM c)
  SELECT CASE WHEN (SELECT claims FROM tot) = 0 THEN NULL ELSE jsonb_build_object(
    'key', p_key,
    'topic', (SELECT topic FROM c ORDER BY said_at DESC LIMIT 1),
    'category', (SELECT mode() WITHIN GROUP (ORDER BY category) FROM c),
    'days', (SELECT days FROM win),
    'claims', (SELECT claims FROM tot),
    'sources', (SELECT count(DISTINCT source_id) FROM c),
    'for', (SELECT count(*) FROM c WHERE stance = 1), 'against', (SELECT count(*) FROM c WHERE stance = -1), 'mixed', (SELECT count(*) FROM c WHERE stance = 0),
    'net', (SELECT round(((w_for - w_against) / nullif(w_for + w_against + w_mixed, 0))::NUMERIC, 3) FROM tot),
    'agreement', (SELECT fut.kb_agreement(claims, w_for, w_against, w_mixed) FROM tot),
    'weeks', (SELECT coalesce(jsonb_agg(jsonb_build_object('week', wk, 'for', f, 'against', a, 'mixed', m) ORDER BY wk), '[]'::JSONB) FROM (
      SELECT date_trunc('week', said_at) AS wk, count(*) FILTER (WHERE stance = 1) AS f, count(*) FILTER (WHERE stance = -1) AS a,
        count(*) FILTER (WHERE stance = 0) AS m FROM c GROUP BY 1) w),
    'statements', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'statement', c.statement, 'stance', c.stance, 'strength', c.strength, 'said_at', c.said_at, 'weight', c.weight,
        'source', jsonb_build_object('id', s.id, 'kind', s.kind, 'url', s.url, 'title', s.title, 'community', s.community, 'score', s.score,
          'published_at', s.published_at, 'mine', c.mine)) ORDER BY c.weight DESC, c.said_at DESC), '[]'::JSONB)
      FROM (SELECT * FROM c ORDER BY weight DESC, said_at DESC LIMIT 80) c JOIN fut.kb_sources s ON s.id = c.source_id)
  ) END;
$$;

-- Claims matching a question or search, best first (text match, weight, and newer counts more). With no usable
-- words it returns the strongest recent claims.
CREATE OR REPLACE FUNCTION fut.kb_search(p_user UUID, p_q TEXT, p_limit INTEGER DEFAULT 40, p_days INTEGER DEFAULT 120)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  WITH q AS (SELECT
    -- Any of the words, so "best tactics for 4-4-2" still finds claims that only say "4-4-2". Formations are matched
    -- as whole strings below (the text search splits "4-2-3-1" into numbers that every formation shares).
    nullif(array_to_string(ARRAY(SELECT quote_literal(w) || ':*' FROM unnest(tsvector_to_array(to_tsvector('english', coalesce(p_q, '')))) w
      WHERE w !~ '^[-0-9.]+$' AND length(w) >= 2), ' | '), '') AS words,
    ARRAY(SELECT m[1] FROM regexp_matches(coalesce(p_q, ''), '([0-9](?:-[0-9]){2,4})', 'g') m) AS formations),
  c AS (SELECT v.*,
      CASE WHEN q.words IS NULL THEN 0 ELSE ts_rank(k.search, to_tsquery('english', q.words)) END
      + CASE WHEN length(btrim(coalesce(p_q, ''))) > 0 AND position(lower(v.topic) IN lower(p_q)) > 0 THEN 1 ELSE 0 END
      + CASE WHEN EXISTS (SELECT 1 FROM unnest(q.formations) f WHERE position(f IN v.topic) > 0) THEN 1 ELSE 0 END AS rank,
      q.words IS NULL AND cardinality(q.formations) = 0 AS browse
    FROM q, fut.kb_visible_claims(p_user, now() - make_interval(days => least(greatest(coalesce(p_days, 120), 1), 365))) v
    JOIN fut.kb_claims k ON k.id = v.id
    WHERE (cardinality(q.formations) = 0 OR EXISTS (SELECT 1 FROM unnest(q.formations) f WHERE position(f IN v.topic || ' ' || v.statement) > 0))
      AND (q.words IS NULL OR cardinality(q.formations) > 0 OR k.search @@ to_tsquery('english', q.words) OR position(lower(v.topic) IN lower(p_q)) > 0))
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'topic_key', c.topic_key, 'topic', c.topic, 'category', c.category, 'statement', c.statement, 'stance', c.stance,
      'said_at', c.said_at, 'weight', c.weight,
      'source', jsonb_build_object('id', s.id, 'kind', s.kind, 'url', s.url, 'title', s.title, 'community', s.community, 'score', s.score,
        'published_at', s.published_at, 'mine', c.mine)) ORDER BY c.score_all DESC, c.id), '[]'::JSONB)
  FROM (SELECT *, (CASE WHEN browse THEN 1 ELSE rank + 0.05 END) * weight * exp(-extract(epoch FROM now() - said_at) / 86400 / 45) AS score_all FROM c
    ORDER BY score_all DESC, id LIMIT least(greatest(coalesce(p_limit, 40), 1), 100)) c
  JOIN fut.kb_sources s ON s.id = c.source_id;
$$;

-- Sources, newest first: everything shared plus the user's own, or only the user's own.
CREATE OR REPLACE FUNCTION fut.kb_source_list(p_user UUID, p_mine BOOLEAN DEFAULT false, p_limit INTEGER DEFAULT 30, p_offset INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  WITH s AS (SELECT * FROM fut.kb_sources WHERE CASE WHEN p_mine THEN added_by = p_user ELSE shared OR added_by = p_user END)
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM s),
    'sources', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', x.id, 'kind', x.kind, 'url', x.url, 'title', x.title, 'community', x.community, 'author', x.author, 'excerpt', x.excerpt,
        'published_at', x.published_at, 'collected_at', x.collected_at, 'score', x.score, 'comments', x.comments, 'status', x.status, 'note', x.note,
        'shared', x.shared, 'mine', x.added_by IS NOT DISTINCT FROM p_user AND x.added_by IS NOT NULL,
        'claims', (SELECT count(*) FROM fut.kb_claims c WHERE c.source_id = x.id)) ORDER BY x.collected_at DESC, x.id)
      FROM (SELECT * FROM s ORDER BY collected_at DESC, id LIMIT least(greatest(coalesce(p_limit, 30), 1), 100) OFFSET greatest(coalesce(p_offset, 0), 0)) x), '[]'::JSONB));
$$;

-- Bank totals and the last collection run.
CREATE OR REPLACE FUNCTION fut.kb_status()
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  SELECT jsonb_build_object(
    'sources', (SELECT count(*) FROM fut.kb_sources WHERE shared),
    'claims', (SELECT count(*) FROM fut.kb_claims c JOIN fut.kb_sources s ON s.id = c.source_id WHERE s.shared),
    'topics', (SELECT count(DISTINCT c.topic_key) FROM fut.kb_claims c JOIN fut.kb_sources s ON s.id = c.source_id WHERE s.shared),
    'waiting', (SELECT count(*) FROM fut.kb_sources WHERE status = 'pending' AND attempts < 3 AND body IS NOT NULL),
    'last_run', (SELECT to_jsonb(r) FROM fut.kb_runs r ORDER BY started_at DESC LIMIT 1),
    'last_success', (SELECT max(finished_at) FROM fut.kb_runs WHERE error IS NULL AND finished_at IS NOT NULL));
$$;

-- Keeps only the link, kind, community, date and score of collected sources 30 days after collection, and old runs.
CREATE OR REPLACE FUNCTION fut.kb_cleanup()
RETURNS INTEGER LANGUAGE plpgsql SET search_path = pg_catalog, fut AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE fut.kb_sources SET title = NULL, author = NULL, excerpt = NULL, body = NULL,
    status = CASE WHEN status = 'pending' THEN 'skipped' ELSE status END
  WHERE added_by IS NULL AND collected_at < now() - interval '30 days' AND (title IS NOT NULL OR author IS NOT NULL OR excerpt IS NOT NULL OR body IS NOT NULL);
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM fut.kb_runs WHERE started_at < now() - interval '60 days';
  RETURN n;
END;
$$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['kb_weight(SMALLINT, INTEGER)', 'kb_collect(JSONB)', 'kb_pending(INTEGER)', 'kb_known_topics(INTEGER)',
    'kb_save_reading(UUID, TEXT, TEXT, JSONB)', 'kb_add(UUID, JSONB)', 'kb_delete(UUID, UUID)', 'kb_visible_claims(UUID, TIMESTAMPTZ)',
    'kb_agreement(BIGINT, NUMERIC, NUMERIC, NUMERIC)', 'kb_map(UUID, INTEGER, TEXT)', 'kb_topic(UUID, TEXT, INTEGER)',
    'kb_search(UUID, TEXT, INTEGER, INTEGER)', 'kb_source_list(UUID, BOOLEAN, INTEGER, INTEGER)', 'kb_status()', 'kb_cleanup()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION fut.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION fut.%s TO service_role', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
