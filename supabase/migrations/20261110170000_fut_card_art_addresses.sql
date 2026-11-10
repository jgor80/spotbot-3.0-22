-- Card art addresses (Jeff, 2026-11-10). The XI Lab helper (0.8.0+) notes the addresses of card backgrounds the
-- EA Web App loads while a user browses (never the images, nothing about the account). EA's promo, Icon and Hero
-- backgrounds can't be guessed from outside, so these sightings show EA's naming. They are public EA file addresses,
-- shared across users; who sent them is not kept. Service role only (fut-api).

CREATE TABLE fut.ea_card_art (
  url            TEXT PRIMARY KEY CHECK (url ~ '^https://' AND length(url) <= 400),
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sightings      INTEGER NOT NULL DEFAULT 1 CHECK (sightings > 0)
);
CREATE INDEX ea_card_art_last_seen_idx ON fut.ea_card_art (last_seen_at DESC);

GRANT ALL ON fut.ea_card_art TO service_role;
ALTER TABLE fut.ea_card_art ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: service role only.

-- Adds one upload's addresses: new ones are inserted, known ones get a sighting.
CREATE OR REPLACE FUNCTION fut.record_card_art(p_urls TEXT[])
RETURNS INTEGER
LANGUAGE sql
SECURITY INVOKER
SET search_path = fut, pg_temp
AS $$
  WITH ins AS (
    INSERT INTO fut.ea_card_art AS a (url)
    SELECT DISTINCT u FROM unnest(p_urls) AS u WHERE u IS NOT NULL
    ON CONFLICT (url) DO UPDATE SET last_seen_at = now(), sightings = a.sightings + 1
    RETURNING (xmax = 0) AS inserted
  )
  SELECT count(*)::INTEGER FROM ins WHERE inserted;
$$;
REVOKE ALL ON FUNCTION fut.record_card_art(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.record_card_art(TEXT[]) TO service_role;
