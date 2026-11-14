-- Outside competitions for Social Hub servers (public/spotbot/hub-umbrella.cjs): leagues and BYOTs run
-- elsewhere that hub captains or admins list, and the hub teams entering them under the hub's name.
-- The bot writes with the service role; the server's members can read them.
CREATE TABLE IF NOT EXISTS public.hub_outside_comps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL,
  name text NOT NULL,
  url text,
  platform text,
  starts text,
  note text,
  posted_by text NOT NULL,
  teams jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 days')
);
CREATE INDEX IF NOT EXISTS hub_outside_comps_guild_idx ON public.hub_outside_comps (guild_id, expires_at);

ALTER TABLE public.hub_outside_comps ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.hub_outside_comps TO authenticated;
DROP POLICY IF EXISTS "Members read outside competitions" ON public.hub_outside_comps;
CREATE POLICY "Members read outside competitions" ON public.hub_outside_comps FOR SELECT TO authenticated USING (guild_id IN (SELECT public.my_guild_ids()));
