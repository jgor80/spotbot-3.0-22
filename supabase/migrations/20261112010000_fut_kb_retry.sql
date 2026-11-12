-- Knowledge bank fixes (2026-11-12):
-- 1. kb_known: which collected sources are already in the bank, so the Reddit RSS collector only fetches the comments
--    of posts it hasn't seen (Reddit rate-limits its public feeds, HTTP 429).
-- 2. Sources that failed only because the Anthropic account ran out of credit go back in the queue. The reader now stops
--    a run without counting an attempt when that happens. Collected ones whose text was already dropped are removed so
--    the collector can pick them up again; users' own sources are left alone.
CREATE OR REPLACE FUNCTION fut.kb_known(p_kind TEXT, p_ids JSONB)
RETURNS JSONB LANGUAGE sql STABLE SET search_path = pg_catalog, fut AS $$
  SELECT coalesce(jsonb_agg(external_id), '[]'::JSONB) FROM fut.kb_sources
  WHERE kind = p_kind AND jsonb_typeof(p_ids) = 'array'
    AND external_id IN (SELECT jsonb_array_elements_text(p_ids) LIMIT 200);
$$;
REVOKE ALL ON FUNCTION fut.kb_known(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fut.kb_known(TEXT, JSONB) TO service_role;

UPDATE fut.kb_sources SET status = 'pending', attempts = 0, note = NULL
WHERE status IN ('pending', 'failed') AND note ILIKE '%credit balance%' AND body IS NOT NULL;
DELETE FROM fut.kb_sources s
WHERE s.status = 'failed' AND s.note ILIKE '%credit balance%' AND s.body IS NULL AND s.added_by IS NULL
  AND NOT EXISTS (SELECT 1 FROM fut.kb_claims c WHERE c.source_id = s.id);
