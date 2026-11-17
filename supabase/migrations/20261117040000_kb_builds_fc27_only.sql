-- Pro Clubs meta builds: FC 27 only (Jeff, 2026-11-17: "find as many as we can for fc 27 only within the last 9 weeks").
-- The collector now skips anything older than the build window (FUT_KB_BUILD_DAYS, 63 days by default) or titled for an
-- older game. This takes out what is already in the bank from collected sources (not people's own): their builds are
-- removed and the source is kept as 'skipped', so the collector knows it and doesn't fetch it again.
WITH old AS (
  SELECT id FROM fut.kb_sources
  WHERE area = 'proclubs' AND added_by IS NULL
    AND (published_at < timestamptz '2026-09-14 00:00+00'
      OR (coalesce(title, '') ~* '\m(e?a?\s?fc\s?''?2[0-6]|fifa\s?''?[0-9]{2})\M' AND coalesce(title, '') !~* '\mfc\s?''?27\M'))
), gone AS (
  DELETE FROM fut.kb_builds b USING old WHERE b.source_id = old.id RETURNING b.source_id
)
UPDATE fut.kb_sources s SET status = 'skipped', note = 'Not an FC 27 build (older game or before 14 September 2026).'
FROM old WHERE s.id = old.id;
