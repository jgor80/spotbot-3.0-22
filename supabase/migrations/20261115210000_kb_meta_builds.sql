-- Community meta builds (Jeff, 2026-11-15): the Knowledge Bank also collects what the Pro Clubs community says is the
-- best Virtual Pro build for each position (archetype, height and weight, skill moves, weak foot, PlayStyles, the
-- attributes to max, and exact points when someone shared a build link). Sources carry an area: 'fut' (Ultimate Team
-- claims, as before) or 'proclubs' (builds). The reader writes a Pro Clubs source's builds to fut.kb_builds; the
-- community meta build per position is worked out from them in src/lib/metaBuilds.ts. Service role only.

ALTER TABLE fut.kb_sources ADD COLUMN IF NOT EXISTS area TEXT NOT NULL DEFAULT 'fut';
DO $$ BEGIN
  ALTER TABLE fut.kb_sources ADD CONSTRAINT kb_sources_area CHECK (area IN ('fut', 'proclubs'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS fut.kb_builds (
  id BIGSERIAL PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES fut.kb_sources(id) ON DELETE CASCADE,
  position TEXT NOT NULL CHECK (position IN ('ST', 'W', 'CAM', 'CM', 'CDM', 'FB', 'CB', 'GK')),
  -- A key from src/lib/proBuild.ts ARCHETYPES (finisher, spark, ...); null when the source names none.
  archetype TEXT CHECK (archetype ~ '^[a-z]{2,20}$'),
  height_cm SMALLINT CHECK (height_cm BETWEEN 150 AND 210),
  weight_kg SMALLINT CHECK (weight_kg BETWEEN 45 AND 115),
  skill_moves SMALLINT CHECK (skill_moves BETWEEN 1 AND 5),
  weak_foot SMALLINT CHECK (weak_foot BETWEEN 1 AND 5),
  level SMALLINT CHECK (level BETWEEN 1 AND 100),
  playstyles TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(playstyles) <= 15),
  -- Attribute keys from src/lib/proBuild.ts ATTRIBUTES that the source says to max first.
  key_attrs TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(key_attrs) <= 15),
  -- Exact points per attribute, only from a shared build link (Pro Clubs Builder or GafferBot).
  points JSONB CHECK (points IS NULL OR jsonb_typeof(points) = 'object'),
  -- 1: recommended; 0: mixed or how-to; -1: warned against.
  stance SMALLINT NOT NULL CHECK (stance IN (-1, 0, 1)),
  strength SMALLINT NOT NULL DEFAULT 1 CHECK (strength BETWEEN 1 AND 3),
  statement TEXT NOT NULL CHECK (length(statement) BETWEEN 3 AND 300),
  said_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS kb_builds_source ON fut.kb_builds (source_id);
CREATE INDEX IF NOT EXISTS kb_builds_said ON fut.kb_builds (said_at DESC);
GRANT ALL ON fut.kb_builds TO service_role;
GRANT ALL ON SEQUENCE fut.kb_builds_id_seq TO service_role;
ALTER TABLE fut.kb_builds ENABLE ROW LEVEL SECURITY;

-- As before, plus the area each source belongs to.
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
    WHERE x.kind IN ('reddit', 'youtube') AND x.external_id ~ '^[A-Za-z0-9_-]{1,40}$' AND x.url ~ '^https://[^\s]{4,}$' AND length(x.url) <= 600
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

CREATE OR REPLACE FUNCTION fut.kb_pending(p_limit INTEGER DEFAULT 20)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.score DESC, x.collected_at), '[]'::JSONB) FROM (
    SELECT id, kind, url, title, community, published_at, score, body, attempts, collected_at, area FROM fut.kb_sources
    WHERE status = 'pending' AND attempts < 3 AND body IS NOT NULL
    ORDER BY score DESC, collected_at LIMIT least(greatest(coalesce(p_limit, 20), 1), 100)
  ) x;
$$;

CREATE OR REPLACE FUNCTION fut.kb_add(p_user UUID, p_source JSONB)
RETURNS UUID LANGUAGE plpgsql SET search_path = pg_catalog, fut AS $$
DECLARE r RECORD; new_id UUID;
BEGIN
  SELECT * INTO r FROM jsonb_to_record(p_source) AS x(kind TEXT, external_id TEXT, url TEXT, title TEXT, author TEXT, community TEXT,
    published_at TIMESTAMPTZ, score INTEGER, comments INTEGER, body TEXT, excerpt TEXT, shared BOOLEAN, area TEXT);
  IF r.external_id IS NOT NULL THEN
    SELECT id INTO new_id FROM fut.kb_sources WHERE kind = r.kind AND external_id = r.external_id AND (shared OR added_by = p_user);
    IF FOUND THEN RETURN new_id; END IF;
  END IF;
  INSERT INTO fut.kb_sources (kind, external_id, url, title, author, community, published_at, score, comments, body, excerpt, added_by, shared, area)
  VALUES (r.kind, r.external_id, r.url, left(r.title, 300), left(r.author, 100), left(r.community, 100), coalesce(r.published_at, now()),
    greatest(coalesce(r.score, 0), 0), greatest(coalesce(r.comments, 0), 0), r.body, left(r.excerpt, 600), p_user, coalesce(r.shared, false),
    CASE WHEN r.area = 'proclubs' THEN 'proclubs' ELSE 'fut' END)
  ON CONFLICT (kind, external_id) WHERE external_id IS NOT NULL DO NOTHING
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- Saves the builds the reader found in one Pro Clubs source (replacing any earlier reading); failures work like kb_save_reading.
CREATE OR REPLACE FUNCTION fut.kb_save_builds(p_source UUID, p_status TEXT, p_note TEXT, p_builds JSONB)
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
  DELETE FROM fut.kb_builds WHERE source_id = p_source;
  IF p_status = 'read' AND jsonb_typeof(p_builds) = 'array' THEN
    INSERT INTO fut.kb_builds (source_id, position, archetype, height_cm, weight_kg, skill_moves, weak_foot, level, playstyles, key_attrs, points, stance, strength, statement, said_at)
    SELECT p_source, x.position, nullif(x.archetype, ''),
      CASE WHEN x.height_cm BETWEEN 150 AND 210 THEN x.height_cm END, CASE WHEN x.weight_kg BETWEEN 45 AND 115 THEN x.weight_kg END,
      CASE WHEN x.skill_moves BETWEEN 1 AND 5 THEN x.skill_moves END, CASE WHEN x.weak_foot BETWEEN 1 AND 5 THEN x.weak_foot END,
      CASE WHEN x.level BETWEEN 1 AND 100 THEN x.level END,
      ARRAY(SELECT left(e, 40) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(x.playstyles) = 'array' THEN x.playstyles ELSE '[]' END) e LIMIT 15),
      ARRAY(SELECT left(e, 40) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(x.key_attrs) = 'array' THEN x.key_attrs ELSE '[]' END) e LIMIT 15),
      CASE WHEN jsonb_typeof(x.points) = 'object' THEN x.points END,
      x.stance, coalesce(x.strength, 1), left(btrim(x.statement), 300), said
    FROM (SELECT * FROM jsonb_to_recordset(p_builds) AS r(position TEXT, archetype TEXT, height_cm SMALLINT, weight_kg SMALLINT, skill_moves SMALLINT,
      weak_foot SMALLINT, level SMALLINT, playstyles JSONB, key_attrs JSONB, points JSONB, stance SMALLINT, strength SMALLINT, statement TEXT) LIMIT 16) x
    WHERE x.position IN ('ST', 'W', 'CAM', 'CM', 'CDM', 'FB', 'CB', 'GK') AND (x.archetype IS NULL OR x.archetype = '' OR x.archetype ~ '^[a-z]{2,20}$')
      AND x.stance IN (-1, 0, 1) AND coalesce(x.strength, 1) BETWEEN 1 AND 3 AND length(btrim(coalesce(x.statement, ''))) >= 3;
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  UPDATE fut.kb_sources SET status = CASE WHEN p_status = 'read' AND n = 0 THEN 'skipped' ELSE p_status END,
    note = left(p_note, 300), read_at = now(), attempts = attempts + 1, body = NULL
  WHERE id = p_source;
  RETURN n;
END;
$$;

-- The builds behind the community meta builds: shared sources only (they're shown on the public Build lab), newest first.
CREATE OR REPLACE FUNCTION fut.kb_meta_build_rows(p_days INTEGER DEFAULT 180)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'position', b.position, 'archetype', b.archetype, 'height_cm', b.height_cm, 'weight_kg', b.weight_kg, 'skill_moves', b.skill_moves,
      'weak_foot', b.weak_foot, 'level', b.level, 'playstyles', to_jsonb(b.playstyles), 'key_attrs', to_jsonb(b.key_attrs), 'points', b.points,
      'stance', b.stance, 'strength', b.strength, 'statement', b.statement, 'said_at', b.said_at, 'weight', fut.kb_weight(b.strength, s.score),
      'source', jsonb_build_object('id', s.id, 'kind', s.kind, 'url', s.url, 'title', s.title, 'community', s.community, 'score', s.score, 'published_at', s.published_at))
    ORDER BY b.said_at DESC, b.id), '[]'::JSONB)
  FROM (SELECT * FROM fut.kb_builds WHERE said_at > now() - make_interval(days => least(greatest(coalesce(p_days, 180), 7), 730))
        ORDER BY said_at DESC, id LIMIT 3000) b
  JOIN fut.kb_sources s ON s.id = b.source_id
  WHERE s.shared;
$$;

-- Sources list: a Pro Clubs source counts its builds as its claims.
CREATE OR REPLACE FUNCTION fut.kb_source_list(p_user UUID, p_mine BOOLEAN DEFAULT false, p_limit INTEGER DEFAULT 30, p_offset INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  WITH s AS (SELECT * FROM fut.kb_sources WHERE CASE WHEN p_mine THEN added_by = p_user ELSE shared OR added_by = p_user END)
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM s),
    'sources', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', x.id, 'kind', x.kind, 'url', x.url, 'title', x.title, 'community', x.community, 'author', x.author, 'excerpt', x.excerpt,
        'published_at', x.published_at, 'collected_at', x.collected_at, 'score', x.score, 'comments', x.comments, 'status', x.status, 'note', x.note,
        'shared', x.shared, 'mine', x.added_by IS NOT DISTINCT FROM p_user AND x.added_by IS NOT NULL, 'area', x.area,
        'claims', (SELECT count(*) FROM fut.kb_claims c WHERE c.source_id = x.id) + (SELECT count(*) FROM fut.kb_builds b WHERE b.source_id = x.id))
        ORDER BY x.collected_at DESC, x.id)
      FROM (SELECT * FROM s ORDER BY collected_at DESC, id LIMIT least(greatest(coalesce(p_limit, 30), 1), 100) OFFSET greatest(coalesce(p_offset, 0), 0)) x), '[]'::JSONB));
$$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['kb_collect(JSONB)', 'kb_pending(INTEGER)', 'kb_add(UUID, JSONB)', 'kb_save_builds(UUID, TEXT, TEXT, JSONB)',
    'kb_meta_build_rows(INTEGER)', 'kb_source_list(UUID, BOOLEAN, INTEGER, INTEGER)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION fut.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION fut.%s TO service_role', f);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
