CREATE TABLE public.pro_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  discord_user_id text NOT NULL UNIQUE,
  ea_username text,
  image_url text NOT NULL,
  position text,
  overall integer,
  archetype text,
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pro_photos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.pro_photos TO anon, authenticated;
GRANT ALL ON public.pro_photos TO service_role;
CREATE POLICY "Pro photos are viewable by everyone" ON public.pro_photos FOR SELECT USING (true);
CREATE TRIGGER update_pro_photos_updated_at BEFORE UPDATE ON public.pro_photos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "Pro photos are publicly readable" ON storage.objects FOR SELECT USING (bucket_id = 'pro-photos');