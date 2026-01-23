-- Enable realtime for global league tables
ALTER PUBLICATION supabase_realtime ADD TABLE global_league_clubs;
ALTER PUBLICATION supabase_realtime ADD TABLE global_league_matches;