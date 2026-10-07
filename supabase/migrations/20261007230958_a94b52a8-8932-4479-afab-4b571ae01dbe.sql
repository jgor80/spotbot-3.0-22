UPDATE public.guild_settings
SET clubs = (SELECT jsonb_agg(CASE WHEN c->>'key'='club1' THEN c || '{"pro_photos_channel_id":"1557529002351005896"}'::jsonb ELSE c END) FROM jsonb_array_elements(clubs::jsonb) c)
WHERE guild_id = '1529555651762851930';