ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS psn_id text,
  ADD COLUMN IF NOT EXISTS sign_in_provider text;
ALTER TABLE public.profiles ALTER COLUMN discord_user_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_auth_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Discord accounts are created by the Discord sign-in function, which writes the profile itself.
  IF NEW.email LIKE 'discord\_%@users.gafferbot.app' THEN RETURN NEW; END IF;
  INSERT INTO public.profiles (auth_user_id, display_name, avatar_url, sign_in_provider)
  VALUES (NEW.id,
    coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url',
    coalesce(NEW.raw_app_meta_data->>'provider','email'))
  ON CONFLICT (auth_user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN others THEN RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_profile();

CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated
USING (auth_user_id = auth.uid()) WITH CHECK (auth_user_id = auth.uid());