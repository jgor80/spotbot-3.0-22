-- Market Lab: prices pulled from the public fc27-market API (Val Town project bowli/fut-market-api), at the user's
-- request (Jeff, 2026-11-02). It is a third-party hobby project, not a licensed feed: its prices come from FUT.GG's
-- PlayStation price file. Private to the user who pulls them, labelled as an estimate.
INSERT INTO fut.market_price_sources (id, name, kind, status, is_demo, status_note, permissions, evidence) VALUES
  ('fc27_market', 'fc27-market (third-party, via Val Town)', 'user_import', 'enabled', false,
   'Pulled on request from the public fc27-market API (Val Town project bowli/fut-market-api). Third-party hobby project, not licensed by EA; its prices come from FUT.GG''s PlayStation price file, and console prices are shared with Xbox. Covers only the top 100 cards per group, updated hourly when its feed works. Private to you.',
   '{"commercial_use":false,"storage":true,"retention_days":null,"display":true,"derived_analytics":true,"model_training":false,"redistribution":false,"attribution":"fc27-market (Val Town)"}', 'estimate')
ON CONFLICT (id) DO NOTHING;
NOTIFY pgrst, 'reload schema';
