CREATE TABLE public.pro_photo_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id text NOT NULL,
  guild_id text NOT NULL,
  submitted_by text,
  image_url text NOT NULL,
  storage_path text,
  source_key text NOT NULL,
  source_kind text NOT NULL DEFAULT 'upload',
  graphic_kind text,
  pose text,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discord_user_id, source_key)
);
GRANT ALL ON public.pro_photo_assets TO service_role;
ALTER TABLE public.pro_photo_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service access only" ON public.pro_photo_assets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX pro_photo_assets_player_pose_idx ON public.pro_photo_assets (discord_user_id, pose, created_at DESC);
INSERT INTO public.pro_photo_assets (discord_user_id, guild_id, submitted_by, image_url, source_key, analysis, created_at)
SELECT discord_user_id, guild_id, submitted_by, image_url, 'legacy:' || id::text, COALESCE(analysis, '{}'::jsonb), created_at FROM public.pro_photos;
COMMENT ON TABLE public.pro_photo_assets IS 'Append-only player photo and generated artwork collection; pro_photos remains the latest uploaded photo for existing consumers.';