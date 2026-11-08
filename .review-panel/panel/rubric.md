# Shared Rubric

Every judge follows this file. Perspectives differ; standards don't.

## Evidence rules

A finding is admissible only if it has all of:

1. **Location** — `path/to/file.ts:42-58`. For something missing, point at where it should be.
2. **Scenario** — concrete steps: who (user role, attacker, cron job, second tab),
   does what (input, sequence, timing), and what happens (wrong data, crash, leak, cost).
   "Could cause issues" is not a scenario.
3. **Impact** — who is affected and how badly.
4. **Safeguards checked** — what you looked for that might prevent it (validation, types,
   RLS policies, DB constraints, tests, caller guarantees) and why it doesn't.
5. **Classification** — exactly one:
   - **Defect**: you traced the code path and it will happen under the scenario.
   - **Risk**: plausible, but depends on something you couldn't verify (runtime config,
     external API behavior, data you can't see). Say what would confirm it.
   - **Preference**: style, structure, or taste. Never above Low severity. Never blocking.

If you can't meet rules 1–4, don't report it. If you're unsure, it's a Risk with Low
confidence — say what you'd need to know.

## Severity

| Level | Meaning | Examples |
|---|---|---|
| **Critical** | Data loss/corruption, security breach, money wrong, or core feature broken for most users. Ships = incident. | Missing RLS lets users read other tenants' rows; payment webhook double-credits; migration drops a column with data |
| **High** | A real user-facing bug on a critical path, or a security weakness needing unusual conditions. | Draft pick races under concurrent clicks; auth token logged; standings wrong after a tie |
| **Medium** | Bug on a non-critical path, degraded behavior, or a maintainability problem likely to cause a bug soon. | Error swallowed so sync fails silently; duplicated logic already drifting |
| **Low** | Minor issue, edge case with trivial impact, or a preference. | Unclear naming, missing log line, small UI inconsistency |

Severity is about **impact if it happens**. Likelihood goes in confidence.

## Confidence

| Level | Meaning |
|---|---|
| **High** | Traced end to end, or reproduced, or a test demonstrates it. |
| **Medium** | Traced the main path; one assumption unverified. |
| **Low** | Plausible from reading; multiple assumptions. |

## Finding format

```
### [SEVERITY] Short title
- Judge: <name>
- Class: Defect | Risk | Preference
- Confidence: High | Medium | Low
- Location: path:lines
- Scenario: …
- Impact: …
- Safeguards checked: …
- Recommendation: smallest change that fixes it
```

## Open questions

If something matters and you can't determine it from the code or brief (intended behavior,
expected scale, whether a table is meant to be public), write it as an open question:

```
- Q (judge): question — why it matters — what the answer would change
```

Never turn a question into a finding by assuming the worst.

The reverse also holds: if your "question" already contains a concrete scenario — who does
what and what goes wrong — it is a **Risk finding**. File it, and put the unknown in the
"Safeguards checked" field as what would confirm it. Burying a real scenario in an open
question is how real bugs get missed.

## Judge score (1–10)

Each judge gives one overall score, the "skating score" shown on the scoreboard.

| Score | Meaning |
|---|---|
| 9–10 | Ship it. Nothing above Low. A 10 is rare and never the goal. |
| 7–8 | Solid. Some Medium findings worth fixing, nothing blocking. |
| 5–6 | Works, but real problems on a path that matters. |
| 3–4 | A High finding, or the change doesn't do what the spec says. |
| 1–2 | A Critical finding, or fundamentally the wrong approach. |

The score must be consistent with your findings: a Critical caps you at 2, a High at 4.
A score ≤ 6 needs at least one Medium+ finding behind it. Being harsh means demanding
evidence of quality — it does not mean scoring low without reasons.

**Panel score** = median of judge scores (median, so one outlier can't swing it), shown to
one decimal. It tracks progress across rounds. The verdict comes from findings.

## Scorecard dimensions

Each judge scores only the dimensions it actually assessed. 1–5, or `n/a` (not assessed).

| Dimension | 5 means | 1 means |
|---|---|---|
| Correctness | Does what the intent says, including edge cases | Core behavior wrong |
| Security | Trust boundaries enforced, inputs validated, secrets safe | Exploitable now |
| Maintainability | A new person could change it safely | Changing it will break something non-obvious |
| Product fit | Solves the stated problem proportionately | Wrong problem or wildly over/under-built |
| Operational readiness | Failures are visible, recoverable, and bounded in cost | Fails silently or unrecoverably |

A 3 is "acceptable, nothing notable." Scores without a finding behind them should be 3–5.
A score of 1 or 2 must be backed by at least one Medium+ finding.

## What is out of bounds for every judge

- Rewrites "because I'd do it differently."
- Framework or library swaps.
- Flagging pre-existing code in Diff scope unless the change depends on it or worsens it.
- Speculative scale problems with no evidence the app approaches that scale.
- Re-litigating a constraint listed in the app config.

## Changes

- 2026-11-08 — GafferBot seed test: a question containing a concrete scenario must be filed as a Risk
