-- Evolutions finder: the evolutions the XI Lab helper copied from the EA Web App's Evolutions screen (academy answers).
-- Private to the owner through fut-api (service role only), like the rest of account_state.
ALTER TABLE fut.account_state
  ADD COLUMN IF NOT EXISTS evolutions JSONB,
  ADD COLUMN IF NOT EXISTS evolutions_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
