-- Update the default clubs JSONB to support 10 clubs
ALTER TABLE guild_settings 
ALTER COLUMN clubs SET DEFAULT '[{"key": "club1", "name": "Club 1", "enabled": true}, {"key": "club2", "name": "Club 2", "enabled": false}, {"key": "club3", "name": "Club 3", "enabled": false}, {"key": "club4", "name": "Club 4", "enabled": false}, {"key": "club5", "name": "Club 5", "enabled": false}, {"key": "club6", "name": "Club 6", "enabled": false}, {"key": "club7", "name": "Club 7", "enabled": false}, {"key": "club8", "name": "Club 8", "enabled": false}, {"key": "club9", "name": "Club 9", "enabled": false}, {"key": "club10", "name": "Club 10", "enabled": false}]'::jsonb;

-- Update existing guilds to add the new club slots (only if they don't have 10 clubs yet)
UPDATE guild_settings
SET clubs = clubs || '[{"key": "club6", "name": "Club 6", "enabled": false}, {"key": "club7", "name": "Club 7", "enabled": false}, {"key": "club8", "name": "Club 8", "enabled": false}, {"key": "club9", "name": "Club 9", "enabled": false}, {"key": "club10", "name": "Club 10", "enabled": false}]'::jsonb
WHERE jsonb_array_length(clubs) < 10;