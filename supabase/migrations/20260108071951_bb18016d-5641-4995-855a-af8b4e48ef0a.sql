-- Add Xbox fields to profiles for presence tracking
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS xbox_gamertag TEXT,
ADD COLUMN IF NOT EXISTS xbox_xuid TEXT,
ADD COLUMN IF NOT EXISTS xbox_last_online TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS xbox_last_game TEXT;

-- Index for XUID lookups
CREATE INDEX IF NOT EXISTS idx_profiles_xbox_xuid ON profiles(xbox_xuid) WHERE xbox_xuid IS NOT NULL;

-- Table to track active game sessions detected from spot panel players
CREATE TABLE IF NOT EXISTS active_game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  club_key TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  detected_score TEXT DEFAULT '0-0',
  last_score TEXT,
  player_count INTEGER NOT NULL,
  players JSONB NOT NULL,
  status TEXT DEFAULT 'in_progress',
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_sessions_guild ON active_game_sessions(guild_id, club_key, status);

-- Enable RLS
ALTER TABLE active_game_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view game sessions"
  ON active_game_sessions FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage game sessions"
  ON active_game_sessions FOR ALL
  USING (true)
  WITH CHECK (true);

-- Historical session log for analytics
CREATE TABLE IF NOT EXISTS xbox_detected_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  players JSONB NOT NULL,
  game_title TEXT,
  player_count INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xbox_sessions_guild ON xbox_detected_sessions(guild_id, detected_at DESC);

ALTER TABLE xbox_detected_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view xbox sessions"
  ON xbox_detected_sessions FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage xbox sessions"
  ON xbox_detected_sessions FOR ALL
  USING (true)
  WITH CHECK (true);