-- Market Lab community price pool (Jeff, 2026-11-02). Users who opt in share the lowest prices their own XI Lab
-- helper recorded from their own EA Web App, and can then pull the pooled prices for their own cards ("give to get").
-- Only the fut-api function (service role) reads or writes these tables; signed-in users get no direct access, so
-- one contributor's rows are never readable by another. Turning sharing off deletes that user's contributions.
CREATE TABLE fut.market_sharing (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sharing     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fut.market_community_observations (
  id                  BIGSERIAL PRIMARY KEY,
  contributor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ea_item_id          BIGINT NOT NULL CHECK (ea_item_id > 0),
  platform            TEXT NOT NULL CHECK (platform IN ('console', 'pc')),
  hour                TIMESTAMPTZ NOT NULL,
  price               INTEGER NOT NULL CHECK (price > 0),
  listings            INTEGER,
  observed_at         TIMESTAMPTZ NOT NULL,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contributor_user_id, ea_item_id, platform, hour)
);
CREATE INDEX fut_mco_item ON fut.market_community_observations (ea_item_id, platform, hour DESC);
CREATE INDEX fut_mco_hour ON fut.market_community_observations (hour);

GRANT ALL ON fut.market_sharing, fut.market_community_observations TO service_role;
GRANT ALL ON SEQUENCE fut.market_community_observations_id_seq TO service_role;
ALTER TABLE fut.market_sharing ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.market_community_observations ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: service role only.

INSERT INTO fut.market_price_sources (id, name, kind, status, is_demo, status_note, permissions, evidence) VALUES
  ('community_pool', 'XI Lab community (pooled Web App captures)', 'browser_capture', 'enabled', false,
   'Prices other XI Lab users recorded from their own EA Web App searches and chose to share. For each hour, the median of each person''s lowest price, outliers dropped. Only for people who share their own prices; never public. Not licensed by EA.',
   '{"commercial_use":false,"storage":true,"retention_days":30,"display":true,"derived_analytics":true,"model_training":false,"redistribution":false,"attribution":"XI Lab community"}', 'estimate')
ON CONFLICT (id) DO NOTHING;
NOTIFY pgrst, 'reload schema';
