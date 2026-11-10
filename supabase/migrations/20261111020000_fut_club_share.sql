-- Club FUT layer in Discord: what a player chooses to share with the Discord servers they're in. Off by default.
-- share_pulls: the bot posts their big pack pulls (rating >= min_pull_rating) to the club channel.
-- share_board: they appear on the club's FUT board (club value, trading profit, Champs record, best pull this week)
-- and in "who has this card". Coins and the transfer list are never shared. Service role only, like the rest of `fut`.

CREATE TABLE fut.club_share (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL DEFAULT 'console' CHECK (platform IN ('console', 'pc')),
  share_pulls      BOOLEAN NOT NULL DEFAULT false,
  share_board      BOOLEAN NOT NULL DEFAULT false,
  min_pull_rating  SMALLINT NOT NULL DEFAULT 86 CHECK (min_pull_rating BETWEEN 75 AND 99),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Pulls already posted (or skipped), so each one goes out once.
CREATE TABLE fut.club_pull_posts (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id    BIGINT NOT NULL,
  posted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
GRANT ALL ON fut.club_share, fut.club_pull_posts TO service_role;
ALTER TABLE fut.club_share ENABLE ROW LEVEL SECURITY;
ALTER TABLE fut.club_pull_posts ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
