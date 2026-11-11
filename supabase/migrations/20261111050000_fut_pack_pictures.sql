-- Pack Advisor (2026-11-11): Jeff saw packs only as id numbers. Helper 0.11.0 also sends EA's art id for each pack
-- and a picture address when the store item carries one (an https EA image address, checked by fut-api).
ALTER TABLE fut.pack_offers
  ADD COLUMN IF NOT EXISTS asset_id BIGINT CHECK (asset_id > 0),
  ADD COLUMN IF NOT EXISTS image_url TEXT CHECK (image_url IS NULL OR (image_url LIKE 'https://%' AND length(image_url) <= 400));
