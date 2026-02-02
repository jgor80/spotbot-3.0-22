
# Fix Discord Draft System

## Problems Identified

### 1. Voice Channel Member Detection is Stale
When the user clicks "Start Draft", the bot reads `interaction.member?.voice?.channel.members` which may be cached. Players who joined/left after the panel was opened won't be detected correctly.

### 2. No Captain Confirmation Before Draft Begins
Currently, the draft immediately starts after selecting captains. There's no step where captains must accept their role before picking begins. This causes issues when:
- A selected captain is AFK
- A captain didn't want to be captain
- Players need time to verify the teams before proceeding

### 3. Database Schema Missing Confirmation State
The `draft_status` enum has `pending`, `picking`, `completed`, `cancelled` but `pending` is never utilized. The draft jumps straight to `picking`.

---

## Proposed Solution

### Database Changes
Add new draft columns to support captain confirmation:

```text
┌─────────────────────────────────────────────────────────┐
│  NEW COLUMNS FOR drafts TABLE                           │
├─────────────────────────────────────────────────────────┤
│ captain_a_confirmed: boolean (default false)            │
│ captain_b_confirmed: boolean (default false)            │
│ confirmation_expires_at: timestamptz                    │
│ confirmation_message_id: text (Discord msg to update)   │
└─────────────────────────────────────────────────────────┘
```

### New Draft Flow

```text
CURRENT FLOW:
┌─────────────┐    ┌──────────┐    ┌───────────┐
│ Start Draft │───►│ Picking  │───►│ Completed │
└─────────────┘    └──────────┘    └───────────┘

NEW FLOW:
┌─────────────┐    ┌────────────────┐    ┌──────────┐    ┌───────────┐
│ Start Draft │───►│ Captain Confirm│───►│ Picking  │───►│ Completed │
│             │    │ (60s timeout)  │    │          │    │           │
└─────────────┘    └────────────────┘    └──────────┘    └───────────┘
                          │
                          ▼ (timeout or decline)
                   ┌────────────────┐
                   │ Auto-reroll or │
                   │ Cancel Draft   │
                   └────────────────┘
```

---

## Implementation Plan

### Phase 1: Database Migration
Add new columns to the `drafts` table:
- `captain_a_confirmed` (boolean, default false)
- `captain_b_confirmed` (boolean, default false)  
- `confirmation_expires_at` (timestamptz, nullable)
- `confirmation_message_id` (text, nullable)

### Phase 2: Update Edge Function (draft-start)
Modify `supabase/functions/draft-start/index.ts` to:
1. Create draft in `status: "pending"` instead of `"picking"`
2. Set `confirmation_expires_at` to 60 seconds from now
3. Return flag indicating confirmation is needed

Changes:
- Line 230-248: Change `status: "picking"` to `status: "pending"`
- Add `confirmation_expires_at: new Date(Date.now() + 60000).toISOString()`
- Add response field `requires_captain_confirmation: true`

### Phase 3: Create New Edge Function (draft-confirm-captain)
New function `supabase/functions/draft-confirm-captain/index.ts`:
- Accepts: `draft_id`, `captain_discord_id`
- Validates captain is part of draft
- Sets `captain_a_confirmed` or `captain_b_confirmed` to true
- If both confirmed, updates `status` to `"picking"`
- Returns current confirmation state

### Phase 4: Update Discord Bot (public/spotbot/index.cjs)
Multiple changes to the bot:

**4a. Force fresh VC member fetch before starting draft**
Replace stale member reads with explicit fetch:
```javascript
// Before
const members = [...voiceChannel.members.values()].filter(m => !m.user.bot);

// After  
const freshChannel = await interaction.guild.channels.fetch(voiceChannel.id, { force: true });
const members = [...freshChannel.members.values()].filter(m => !m.user.bot);
```

**4b. Add captain confirmation buttons**
After draft-start returns, show embed with:
- Two buttons: "✅ Accept Captain (Team A)" and "✅ Accept Captain (Team B)"
- 60-second countdown timer in footer
- Only the respective captain can click their button

**4c. Handle confirmation button clicks**
New button handler `draft_confirm_captain_a` and `draft_confirm_captain_b`:
- Verify clicker is the correct captain
- Call `draft-confirm-captain` edge function
- Update embed to show confirmation status
- When both confirm, transition to pick phase

**4d. Handle confirmation timeout**
- If 60 seconds pass without both confirmations:
  - Auto-select replacement captain from available pool
  - Or cancel draft with message explaining why

**4e. Add "Decline Captain" option**
- Button for captains to decline
- Triggers auto-reroll with remaining eligible players

### Phase 5: Add Pick Timeout with Auto-Pick
Implement the 90-second pick timeout mentioned in memory:
- Track pick start time
- Show countdown in embed
- If timeout: auto-pick best available player for team's needs

---

## Technical Details

### Edge Function: draft-confirm-captain

```typescript
interface DraftConfirmRequest {
  draft_id: string;
  captain_discord_id: string;
}

// Response
{
  success: true,
  captain_confirmed: "a" | "b",
  captain_a_confirmed: boolean,
  captain_b_confirmed: boolean,
  both_confirmed: boolean,
  status: "pending" | "picking"
}
```

### Discord Bot: Confirmation Flow

```text
1. User clicks "Start Draft"
2. Bot fetches FRESH VC members (force: true)
3. Bot calls draft-start → creates draft in "pending"
4. Bot shows confirmation embed:
   ┌─────────────────────────────────────────────┐
   │ ⚔️ DRAFT - CAPTAIN CONFIRMATION             │
   ├─────────────────────────────────────────────┤
   │ 🔴 Captain A: @Player1 - ⏳ Waiting...      │
   │ 🔵 Captain B: @Player2 - ⏳ Waiting...      │
   │                                             │
   │ Available Players: 10                       │
   │                                             │
   │ ⏱️ Captains have 60 seconds to accept      │
   └─────────────────────────────────────────────┘
   [✅ Accept (Team A)] [✅ Accept (Team B)] [❌ Decline]

5. Captain A clicks "Accept" → embed updates
6. Captain B clicks "Accept" → draft transitions to picking
7. If timeout → auto-reroll captains or cancel
```

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/migrations/` | Add captain confirmation columns |
| `supabase/functions/draft-start/index.ts` | Create in pending status, set expiry |
| `supabase/functions/draft-confirm-captain/index.ts` | NEW: Handle confirmation |
| `public/spotbot/index.cjs` | Force VC fetch, confirmation buttons, timeout handling |

---

## Expected Outcomes

After implementation:
1. Voice channel members are always fresh when starting a draft
2. Captains must explicitly accept before picking begins
3. AFK captains are automatically replaced after timeout
4. Clearer user experience with visual confirmation status
5. No more stuck drafts from unresponsive captains
