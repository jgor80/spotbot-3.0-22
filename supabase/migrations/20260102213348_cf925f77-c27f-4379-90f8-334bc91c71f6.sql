-- Create table for Twitch live notification settings per guild
CREATE TABLE public.twitch_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guild_id TEXT NOT NULL,
  twitch_username TEXT NOT NULL,
  notification_channel_id TEXT NOT NULL,
  subscription_id TEXT, -- EventSub subscription ID
  is_live BOOLEAN DEFAULT false,
  last_notified_at TIMESTAMP WITH TIME ZONE,
  custom_message TEXT, -- Optional custom message template
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(guild_id, twitch_username)
);

-- Enable Row Level Security
ALTER TABLE public.twitch_notifications ENABLE ROW LEVEL SECURITY;

-- Allow public read/write (bot uses service role)
CREATE POLICY "Allow all operations for service role"
ON public.twitch_notifications
FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_twitch_notifications_updated_at
BEFORE UPDATE ON public.twitch_notifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();