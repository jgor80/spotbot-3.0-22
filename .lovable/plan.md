
# Apply Selected Friendly Matches to Drafts

## Understanding the Request

The user wants to limit which friendly matches appear as options when linking EA stats to drafts. Instead of showing **every** friendly match, only show **relevant** ones based on smart filtering criteria.

## Filtering Criteria for "Selected" Friendlies

When a user wants to apply friendly stats to a completed draft, the system will only show friendlies that meet ALL of these conditions:

| Criterion | Description |
|-----------|-------------|
| **Time Window** | Friendly played within 2 hours AFTER draft completion |
| **Player Match** | At least 50% of friendly participants are draft players |
| **Not Already Linked** | Friendly's `ea_match_id` not already in `draft_results.ea_match_id` |
| **Same Guild** | Friendly is from the same Discord server as the draft |

## Implementation

### Phase 1: Create Edge Function

**File:** `supabase/functions/apply-friendly-to-draft/index.ts`

The function will:

1. **Accept request:**
   - `guild_id` - Discord server ID
   - `draft_id` - Target draft to apply stats to
   - `ea_match_id` - (optional) Specific friendly to apply
   - `action` - "list" (show available friendlies) or "apply" (link the friendly)

2. **List Mode** - Return only matching friendlies:
   ```
   - Get draft details (teams, completion time)
   - Query club_matches WHERE:
     - match_type = 'friendly'
     - guild_id matches
     - created_at BETWEEN draft.completed_at AND draft.completed_at + 2 hours
     - ea_match_id NOT IN (SELECT ea_match_id FROM draft_results WHERE ea_match_id IS NOT NULL)
   - Filter by player overlap (parse player_stats JSON, match to draft participants)
   - Return filtered list with match details
   ```

3. **Apply Mode** - Link the selected friendly:
   - Validate the friendly meets the criteria
   - Update `draft_results.ea_match_id`
   - Update/insert `player_stats` records with EA data
   - Return success with applied stats summary

### Phase 2: Database Optimization

Add index for efficient queries:

```sql
CREATE INDEX IF NOT EXISTS idx_club_matches_friendly_lookup 
ON club_matches(guild_id, match_type, created_at DESC) 
WHERE match_type = 'friendly';

CREATE INDEX IF NOT EXISTS idx_draft_results_ea_match 
ON draft_results(ea_match_id) 
WHERE ea_match_id IS NOT NULL;
```

### Phase 3: Discord Bot Integration

**File:** `public/spotbot/index.cjs`

Add command and handlers:

1. **Slash Command:** `/applyfriendly [draft_id]`
   - If no draft_id: Shows recent completed drafts to pick from
   - Calls edge function with `action: "list"` to get matching friendlies

2. **Select Menu:** Shows only filtered friendly matches
   ```
   ┌────────────────────────────────────────────────┐
   │ 🎮 Link EA Stats to Draft                      │
   ├────────────────────────────────────────────────┤
   │ Draft: Feb 1 - Team A (3-2) Team B             │
   │                                                │
   │ Matching Friendlies:                           │
   │ ▼ Select a match                               │
   │   • W 3-2 at 8:45 PM (5/6 players match)      │
   │   • W 2-1 at 9:15 PM (4/6 players match)      │
   │                                                │
   │ Only showing friendlies within 2 hours of      │
   │ draft completion with matching players.        │
   └────────────────────────────────────────────────┘
   ```

3. **Apply Handler:** Links selected friendly, shows stats summary

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/apply-friendly-to-draft/index.ts` | CREATE | Edge function with list + apply logic |
| `supabase/config.toml` | MODIFY | Register new function |
| `public/spotbot/index.cjs` | MODIFY | Add command and button handlers |
| `supabase/migrations/` | CREATE | Add performance indexes |

---

## Edge Function API Design

### List Available Friendlies

**Request:**
```json
{
  "guild_id": "1329630673744564274",
  "draft_id": "44a705b3-ff22-4472-8214-cffe69084c06",
  "action": "list"
}
```

**Response:**
```json
{
  "success": true,
  "draft": {
    "id": "...",
    "completed_at": "2026-02-01T20:30:00Z",
    "team_a_score": 3,
    "team_b_score": 2,
    "all_players": ["discord_id_1", "discord_id_2", ...]
  },
  "matching_friendlies": [
    {
      "ea_match_id": "253900702190292",
      "result": "win",
      "score_for": 3,
      "score_against": 2,
      "played_at": "2026-02-01T20:45:00Z",
      "player_count": 5,
      "matching_players": 5,
      "match_percentage": 83
    }
  ]
}
```

### Apply Friendly to Draft

**Request:**
```json
{
  "guild_id": "1329630673744564274",
  "draft_id": "44a705b3-ff22-4472-8214-cffe69084c06",
  "ea_match_id": "253900702190292",
  "action": "apply"
}
```

**Response:**
```json
{
  "success": true,
  "players_updated": 5,
  "stats_applied": [
    { "discord_user_id": "...", "goals": 1, "assists": 2, "rating": 8.2 }
  ]
}
```

---

## Why This Approach Works

1. **Time Window (2 hours)** - Drafts are typically followed immediately by the actual game. A 2-hour window catches the match while filtering out unrelated friendlies from earlier/later.

2. **Player Matching** - By checking if friendly participants match draft players, we ensure the right game is linked. The 50% threshold handles cases where some players disconnect/reconnect with different EA accounts.

3. **Score Hinting** - While not a hard filter, friendlies with matching scores will be shown first, making selection easier.

4. **No Duplicates** - A friendly can only be linked to one draft, preventing accidental double-linking.
