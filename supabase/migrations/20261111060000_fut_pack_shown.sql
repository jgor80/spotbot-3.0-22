-- Helper 0.12.1: when a pack was last matched to a tile on the EA Store screen. Pack Advisor lists only packs the
-- Store screen showed, because the store data holds more packs than the screen offers.
ALTER TABLE fut.pack_offers ADD COLUMN IF NOT EXISTS shown_at TIMESTAMPTZ;
