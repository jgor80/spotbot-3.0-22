-- Public FUT.GG bulk snapshots fetched by the existing Cloudflare Worker. Service role only.
-- Per-card quote times are unavailable; published_at records the dataset's publication, not a sale.
CREATE TABLE fut.futgg_snapshots (
  game_year INTEGER NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('console','pc')),
  published_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  card_count INTEGER NOT NULL,
  priced_count INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  PRIMARY KEY (game_year,platform,published_at),
  CHECK (received_at >= published_at)
);
CREATE TABLE fut.futgg_prices (
  game_year INTEGER NOT NULL,
  platform TEXT NOT NULL,
  ea_item_id BIGINT NOT NULL CHECK (ea_item_id > 0),
  published_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  price INTEGER CHECK (price > 0 AND price <= 15000000),
  status_code SMALLINT NOT NULL CHECK (status_code BETWEEN 0 AND 4),
  provider_value BIGINT CHECK (provider_value >= 0),
  PRIMARY KEY (game_year,platform,ea_item_id,published_at),
  FOREIGN KEY (game_year,platform,published_at) REFERENCES fut.futgg_snapshots ON DELETE CASCADE
);
CREATE INDEX futgg_prices_time ON fut.futgg_prices (game_year,ea_item_id,published_at DESC);
ALTER TABLE fut.futgg_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.futgg_prices ENABLE ROW LEVEL SECURITY;
GRANT ALL ON fut.futgg_snapshots,fut.futgg_prices TO service_role;

INSERT INTO fut.market_price_sources (id,name,kind,status,is_demo,status_note,permissions,evidence) VALUES (
  'futgg_bulk','FUT.GG bulk price snapshots','user_import','enabled',false,
  'Third-party public files, fetched by Cloudflare at 06:00 and 18:00 UTC. Console and PC are separate. Dataset publication time is not a per-card quote timestamp. Not EA data access or a licensed feed. Prices are mapped only to cards the signed-in user can access.',
  '{"commercial_use":false,"storage":true,"retention_days":90,"display":true,"derived_analytics":true,"model_training":false,"redistribution":false,"attribution":"FUT.GG"}',
  'estimate'
);

CREATE FUNCTION fut.ingest_futgg_snapshot(p_platform TEXT,p_game_year INTEGER,p_published_at TIMESTAMPTZ,p_index JSONB,p_prices JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path = pg_catalog,fut AS $$
DECLARE
  digest TEXT := md5(jsonb_build_object('id0',p_index->'id0','d',p_index->'d','v',p_prices->'v','p',p_prices->'p','s',p_prices->'s')::text);
  existing_hash TEXT;
  latest TIMESTAMPTZ;
  n INTEGER;
  priced INTEGER;
  fetched TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_platform NOT IN ('console','pc') OR p_platform IS NULL OR p_game_year <> 27 OR p_game_year IS NULL
     OR p_published_at IS NULL OR p_published_at > fetched OR p_published_at < fetched-INTERVAL '90 days' THEN
    RAISE EXCEPTION 'Invalid FUT.GG platform, year or publication time';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM fut.market_price_sources WHERE id='futgg_bulk' AND status='enabled') THEN
    RAISE EXCEPTION 'FUT.GG source is disabled';
  END IF;
  IF p_index->>'v' IS DISTINCT FROM '2' OR p_prices->>'v' IS DISTINCT FROM '2'
     OR jsonb_typeof(p_index->'d') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_prices->'p') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_prices->'s') IS DISTINCT FROM 'array'
     OR (p_index->>'id0')::BIGINT <= 0 OR p_index->>'id0' IS NULL THEN
    RAISE EXCEPTION 'Unsupported FUT.GG blob format';
  END IF;
  n := jsonb_array_length(p_prices->'p');
  IF n < 1 OR n > 100000 OR n <> jsonb_array_length(p_prices->'s') OR n <> jsonb_array_length(p_index->'d')+1 THEN
    RAISE EXCEPTION 'FUT.GG price/index length mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_index->'d') x(value) WHERE value::BIGINT <= 0 OR value IS NULL) THEN
    RAISE EXCEPTION 'Invalid FUT.GG ID deltas';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('futgg:' || p_game_year || ':' || p_platform,0));
  SELECT payload_hash INTO existing_hash FROM fut.futgg_snapshots
    WHERE game_year=p_game_year AND platform=p_platform AND published_at=p_published_at;
  IF existing_hash IS NOT NULL THEN
    IF existing_hash <> digest THEN RAISE EXCEPTION 'FUT.GG changed prices without changing publication time'; END IF;
    UPDATE fut.futgg_snapshots SET checked_at=fetched WHERE game_year=p_game_year AND platform=p_platform AND published_at=p_published_at;
    RETURN jsonb_build_object('unchanged',true,'published_at',p_published_at,'card_count',n);
  END IF;
  SELECT MAX(published_at) INTO latest FROM fut.futgg_snapshots WHERE game_year=p_game_year AND platform=p_platform;
  IF latest > p_published_at THEN RAISE EXCEPTION 'FUT.GG returned an older snapshot'; END IF;

  INSERT INTO fut.futgg_snapshots VALUES(p_game_year,p_platform,p_published_at,fetched,fetched,n,0,digest);
  WITH deltas AS (
    SELECT 1::BIGINT AS ord,(p_index->>'id0')::BIGINT AS delta
    UNION ALL SELECT ordinality+1,value::BIGINT FROM jsonb_array_elements_text(p_index->'d') WITH ORDINALITY
  ), ids AS (SELECT ord,SUM(delta) OVER (ORDER BY ord) AS ea_id FROM deltas), quotes AS (
    SELECT ea_id,(p_prices->'p'->>((ord-1)::INTEGER))::BIGINT AS raw_price,
      (p_prices->'s'->>((ord-1)::INTEGER))::SMALLINT AS status FROM ids
  )
  INSERT INTO fut.futgg_prices
    SELECT p_game_year,p_platform,ea_id,p_published_at,fetched,
      CASE WHEN status=0 AND raw_price BETWEEN 1 AND 15000000 THEN raw_price::INTEGER ELSE NULL END,
      status,raw_price FROM quotes;
  SELECT COUNT(*) INTO priced FROM fut.futgg_prices WHERE game_year=p_game_year AND platform=p_platform AND published_at=p_published_at AND price IS NOT NULL;
  UPDATE fut.futgg_snapshots SET priced_count=priced WHERE game_year=p_game_year AND platform=p_platform AND published_at=p_published_at;
  -- Retention applies to this shared provider cache, never to users' own imports or cards.
  DELETE FROM fut.futgg_snapshots WHERE game_year=p_game_year AND platform=p_platform AND published_at < fetched-INTERVAL '90 days';
  RETURN jsonb_build_object('unchanged',false,'published_at',p_published_at,'card_count',n,'market_price_count',priced);
END;
$$;
REVOKE ALL ON FUNCTION fut.ingest_futgg_snapshot(TEXT,INTEGER,TIMESTAMPTZ,JSONB,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION fut.ingest_futgg_snapshot(TEXT,INTEGER,TIMESTAMPTZ,JSONB,JSONB) TO service_role;

CREATE FUNCTION fut.record_futgg_run(p_status TEXT,p_started_at TIMESTAMPTZ,p_message TEXT)
RETURNS VOID LANGUAGE plpgsql SET search_path=pg_catalog,fut AS $$
BEGIN
  IF p_status NOT IN ('succeeded','failed') OR p_status IS NULL THEN RAISE EXCEPTION 'Invalid sync status'; END IF;
  INSERT INTO fut.market_provider_runs(source_id,started_at,finished_at,status,message)
    VALUES('futgg_bulk',p_started_at,clock_timestamp(),p_status,left(p_message,2000));
END;
$$;
REVOKE ALL ON FUNCTION fut.record_futgg_run(TEXT,TIMESTAMPTZ,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION fut.record_futgg_run(TEXT,TIMESTAMPTZ,TEXT) TO service_role;
NOTIFY pgrst,'reload schema';
