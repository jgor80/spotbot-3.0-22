# Production Gate — "Ship"

From the talk: a vibe-coded tool that lives on your machine is the car you wouldn't put on the
highway. Before clients or the public use it, someone in the **engineer role** makes it safe
so nobody has to worry about losing sensitive data, getting hacked, or spending thousands on
API keys.

Run this gate in Deep mode and before any first public/client launch. Each item is
**PASS / FAIL / UNKNOWN** with evidence (file:line, config screenshot, or command output).
UNKNOWN is fine — it becomes a hand-off item, not a guess.

## 1. Sensitive data

- [ ] Every table with user or client data has RLS enabled with policies that scope rows to
      the owner / tenant / league. Checked in migrations, not assumed.
- [ ] Storage buckets are private unless intentionally public; signed URLs expire.
- [ ] No service-role or admin keys in browser code, client bundles, or public env vars
      (e.g. anything prefixed `VITE_` / `NEXT_PUBLIC_` is public).
- [ ] Logs and error messages don't contain tokens, emails, or client data.
- [ ] Data sent to AI providers is the minimum needed; client data isn't sent where the
      client hasn't agreed to it.

## 2. Getting hacked

- [ ] Every server entry point (route, edge function, webhook, Discord command, cron
      endpoint) authenticates the caller and authorizes the action server-side.
- [ ] Webhooks verify signatures (Discord, Stripe, etc.).
- [ ] User-supplied URLs fetched by the server are restricted (no internal addresses).
- [ ] User input rendered as HTML is escaped; no `dangerouslySetInnerHTML` on user content.
- [ ] AI tool-use / agent features can't be steered by user or third-party content into
      privileged actions (prompt injection).
- [ ] Dependencies: `npm audit` (or equivalent) has no unaddressed High/Critical.

## 3. Spending thousands on API keys

- [ ] Every paid-API call path is behind auth.
- [ ] Rate limits per user/IP on paid endpoints.
- [ ] Hard caps on input size, max tokens, pages crawled, retries.
- [ ] No unbounded loops or recursive retries around paid calls.
- [ ] Billing alerts / spend limits set on each provider account (UNKNOWN until confirmed
      by the owner).
- [ ] Keys are scoped to least privilege and can be rotated without a redeploy scramble.

## 4. Reliability basics

- [ ] Errors are caught at boundaries and surfaced (user message, admin log, or alert).
- [ ] Scheduled jobs are idempotent and safe to re-run; overlapping runs are prevented.
- [ ] External API failures degrade gracefully (stale data shown with a label beats a
      blank page).
- [ ] There's a way to roll back a bad deploy and a bad migration.
- [ ] Backups exist for the production database (UNKNOWN until confirmed).

## Output

```markdown
## Production gate — <app> — <date>
Result: READY | READY WITH HAND-OFFS | NOT READY

| # | Item | Status | Evidence |
|---|---|---|---|

### Hand-off list (for the engineer role)
1. <FAIL or UNKNOWN item> — what to check or change — where
```

NOT READY if any item in sections 1–3 is FAIL. UNKNOWNs go to the hand-off list.
