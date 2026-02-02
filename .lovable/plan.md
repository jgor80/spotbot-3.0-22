
# Fix Discord Draft System ✅ COMPLETED

## Implementation Summary

All phases have been implemented:

### Phase 1: Database Migration ✅
Added new columns to the `drafts` table:
- `captain_a_confirmed` (boolean, default false)
- `captain_b_confirmed` (boolean, default false)  
- `confirmation_expires_at` (timestamptz, nullable)
- `confirmation_message_id` (text, nullable)

### Phase 2: Update Edge Function (draft-start) ✅
Modified `supabase/functions/draft-start/index.ts` to:
1. Create draft in `status: "pending"` instead of `"picking"`
2. Set `confirmation_expires_at` to 60 seconds from now
3. Return `requires_captain_confirmation: true` flag
4. Return confirmation expiry timestamp

### Phase 3: Create New Edge Function (draft-confirm-captain) ✅
Created `supabase/functions/draft-confirm-captain/index.ts`:
- Accepts: `draft_id`, `captain_discord_id`, `action` (confirm/decline)
- Validates captain is part of draft
- Sets `captain_a_confirmed` or `captain_b_confirmed` to true
- If both confirmed, updates `status` to `"picking"`
- If declined, cancels the draft
- Returns current confirmation state

### Phase 4: Update Discord Bot ✅
Updated `public/spotbot/index.cjs`:

**4a. Fresh VC member fetch**
- Now uses `await interaction.guild.channels.fetch(voiceChannel.id, { force: true })` to get fresh members

**4b. Captain confirmation buttons**
- Shows confirmation embed with "Accept Captain (Team A/B)" and "Decline" buttons
- 60-second countdown handled by setTimeout

**4c. Button handlers**
- `draft_confirm_a_{draftId}` - Captain A confirms
- `draft_confirm_b_{draftId}` - Captain B confirms  
- `draft_decline_{draftId}` - Either captain declines
- `draft_pick_{draftId}_{playerId}` - Pick a player during draft

**4d. Timeout handling**
- 60-second setTimeout that cancels draft if both captains don't confirm

**4e. Transition to picking**
- `transitionToPicking()` helper function builds the pick UI
- `buildDraftPickButtonRows()` creates interactive player pick buttons

---

## New Draft Flow

```text
┌─────────────┐    ┌────────────────┐    ┌──────────┐    ┌───────────┐
│ Start Draft │───►│ Captain Confirm│───►│ Picking  │───►│ Completed │
│             │    │ (60s timeout)  │    │          │    │           │
└─────────────┘    └────────────────┘    └──────────┘    └───────────┘
                          │
                          ▼ (timeout or decline)
                   ┌────────────────┐
                   │ Draft Cancelled│
                   └────────────────┘
```

---

## Files Modified

| File | Changes |
|------|---------|
| `supabase/migrations/` | Added captain confirmation columns |
| `supabase/functions/draft-start/index.ts` | Create in pending status, set expiry |
| `supabase/functions/draft-confirm-captain/index.ts` | NEW: Handle confirmation |
| `supabase/config.toml` | Added verify_jwt=false for new function |
| `public/spotbot/index.cjs` | Fresh VC fetch, confirmation flow, pick buttons |

---

## Expected Outcomes ✅

1. ✅ Voice channel members are always fresh when starting a draft
2. ✅ Captains must explicitly accept before picking begins
3. ✅ AFK captains are automatically handled after timeout
4. ✅ Clearer user experience with visual confirmation status
5. ✅ No more stuck drafts from unresponsive captains
