-- Track when link DMs were sent to users
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS link_dm_sent_at TIMESTAMPTZ;

-- Guild setting to enable/disable link DMs
ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS link_dm_enabled BOOLEAN DEFAULT true;