# Calibration

Agreement between judges isn't proof they're right. Outcomes are. Each repo keeps a ledger
at `.review-panel/ledger.md`; this file says how to use it.

## Ledger format

```markdown
| ID | Date | App | Judge(s) | Sev | Conf | Title | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| RP-0001 | 2026-11-08 | diamond-tracker | skeptic, correctness | High | Med | Draft pick race on double-click | accepted | fixed in abc123 |
```

**Status** (update as you learn):

- `open` — just reported
- `accepted` — real, fixed or scheduled
- `wontfix` — real but not worth it (note why)
- `false-alarm` — wasn't real (note the counterevidence)
- `escaped` — a bug found in production that the panel reviewed and missed. Add these as
  new rows with the judge that *should* have caught it.

Dismissed findings from the referee section also get rows with status `dismissed`.

## Tuning loop (monthly, or every ~20 findings)

1. Count per judge: accepted, false-alarm, dismissed, escaped.
2. **High false-alarm or dismissed rate** → the judge is overreaching. Add a concrete line
   to its **Do not flag** section describing the pattern.
3. **Escapes** → the judge missed a class of bug. Add the pattern to its **Frameworks**
   list, phrased as a question it should ask.
4. **Severity drift** (many downgrades by the referee) → add an example to the rubric's
   severity table.
5. Keep each change small and dated in a `## Changes` section at the bottom of the judge
   file, so you can tell which edit helped.

## Seed test before rollout

Before trusting the panel on a repo, run it against 3–5 past commits where you already know
there was a bug (or where you introduced one on a scratch branch). Record whether the panel
caught each one, at what severity, and how many false alarms came with it. That's your
baseline.

## Signs the panel needs tuning

- Rounds keep producing new Low/Preference findings after the real issues are fixed
  (judges "fighting" — tighten Do not flag).
- Panel score barely moves between rounds even though fixes landed (scores not tied to
  findings — re-read the rubric's score rules).
- Every review ends FIX FIRST (severity inflation).
