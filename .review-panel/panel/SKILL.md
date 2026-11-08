---
name: review-panel
description: Run a multi-judge code review (skeptic, advocate, correctness, security, maintainer, refereed) on a change or a whole codebase, using the shared rubric and the repo's REVIEW_PANEL.md. Use for "review this PR", "audit this project", "run the panel", or "judge this".
---

# Review Panel

A panel of judges with different philosophies reviews the same code against one shared
standard. Judges disagree on **priorities**, never on **evidence rules**.

The workflow follows David Bell's loop from *"I Can't Code. Here's How I Built Our Entire
Client Intelligence System Anyway"* (Tech SEO Connect, Nov 2026):

> **Specify → Role → Prompt → Critique → Ship**
>
> The human owns the vision. AI drafts. A harsh, framework-driven judge scores each round.
> Iterate until it's good enough (a 9, not a 10). Engineers make it safe before production.

Mapped onto code review:

| Talk step | In this package |
|---|---|
| **Specify** — the vision; don't turn the car into a boat halfway | §1 Spec brief. Every judge reviews against the stated intent, and flags drift from it. |
| **Role** — who's on the team | `judges/*.md`, one role each |
| **Prompt** — role, job, frameworks, process (d.school structure) | Each judge file has exactly those four sections. Frameworks teach the judge *how* to think. |
| **Critique** — the Cold War Olympic judge, scored rounds | §2–§4 independent review, cross-examination, referee; §6 the round loop |
| **Ship** — engineers make it safe | §7 Production gate: data exposure, attack surface, runaway API spend |

## Files

| File | Purpose |
|---|---|
| `rubric.md` | Evidence rules, severity, confidence, scoring. Every judge obeys it. |
| `judges/*.md` | skeptic, advocate, correctness, security, maintainer, referee |
| `report-template.md` | Exact output format, including the scoreboard |
| `production-gate.md` | The ship checklist for anything going in front of clients or the public |
| `calibration.md` | Log outcomes; tune judges against real results |
| `config/REVIEW_PANEL.template.md` | Per-app config; a copy lives at each repo root |
| `config/examples/` | Draft configs for specific apps |
| `entry-points/` | How to run this in Claude Code, from AGENTS.md, or in chat |
| `ROLLOUT.md` | Plan for reviewing every project |

---

## 0. Pick scope and mode

**Scope**

- **Diff** (default): a branch, PR, commit range, or uncommitted changes. Review the change
  plus whatever surrounding code you need to judge it. Pre-existing problems are out of
  scope unless the change depends on or worsens them.
- **Audit**: the whole codebase, for a project that's never been reviewed. Don't try to read
  everything. Slice by the config's `critical_paths`, review each slice as if it were a
  change, and report coverage honestly.

**Mode**

| Mode | Use when | Judges |
|---|---|---|
| Quick | Small routine diffs (copy, styling, isolated UI) | correctness, maintainer |
| Standard | Most diffs | skeptic, advocate, correctness, maintainer |
| Deep | Anything matching `require_security_for`, every audit, anything touching data model / auth / money / external inputs / AI API calls | all five + cross-examination + production gate |

If the config requires security review for what changed, Deep is the floor. Say so.

## 1. Specify — build the spec brief

Every judge gets the same brief. This is the "vision" from the talk: judges review against
it, not against their own idea of the app.

1. Read `REVIEW_PANEL.md` at the repo root. If missing, say so, infer from `README`,
   `AGENTS.md`, `CLAUDE.md`, `package.json`, and use Standard mode.
2. Read repo instructions (`AGENTS.md`, `CLAUDE.md`, contributing docs).
3. Get the change: `git diff <base>...HEAD`, or the files in the audit slice.
4. For each changed area, read callers, callees, types/schemas, and any database
   migrations, RLS policies, or edge functions it touches.
5. Write the **intent** in 2–5 sentences: what this change is supposed to do and for whom.
   Sources: PR description, commits, issue, or the user.
   **If you can't tell, ask the user before reviewing.** Don't read their mind. If the user
   isn't available, write "Intent unclear", list your assumptions, and carry them into the
   report.
6. Run the config's `validation` commands if possible. Record exact pass/fail. If not run,
   say why.

The brief = app summary, critical paths, constraints, intent, file list, validation
results, relevant code excerpts with paths and line numbers.

## 2. Critique — independent review

Each judge in the mode reviews **independently**: same brief, its own judge file, plus
`rubric.md`. No judge sees another's output in this phase — the first confident reviewer
otherwise steers the whole panel.

- **With subagents** (e.g. Claude Code's Agent tool): one subagent per judge, in parallel.
  The prompt contains the brief, the full judge file, and the full rubric. Ask for output in
  the rubric's finding format plus the judge's score, nothing else.
- **Without subagents:** run judges as separate sequential passes and disclose
  "Judges ran sequentially in one context; independence is reduced."
- **Optional model diversity:** the talk used different models for different roles. If you
  have access to more than one model, running the skeptic or security judge on a different
  model than the author's is a cheap way to break shared blind spots. Record which model ran
  which judge.

Each judge returns: findings (zero is fine), open questions, a 1–10 score with a one-line
reason, and per-dimension scores for what it assessed.

## 3. Cross-examination (Deep mode, or any disputed finding)

A finding is **disputed** if it's High/Critical, or Medium with Low confidence, or another
judge directly contradicts it. Give each disputed finding to a *different* judge (advocate
for skeptic/security findings; skeptic for advocate dismissals):

> Look for counterevidence: a guard, test, type, RLS policy, DB constraint, or caller
> guarantee that prevents this. Can you construct the failure concretely?
> Answer UPHELD / WEAKENED / REFUTED with evidence.

Don't cross-examine clear findings. It doubles cost for little gain.

## 4. Referee

Run `judges/referee.md` over all findings and cross-examination results. It merges
duplicates, throws out anything failing the evidence rules, sets final severity and
confidence, and makes the call.

## 5. Report

Use `report-template.md` exactly: verdict → scoreboard → blocking findings → other
findings → open questions → disagreements → accepted tradeoffs → coverage gaps →
dismissed. Coverage gaps are mandatory. Save to `.review-panel/reports/<date>-<scope>.md`.

## 6. Rounds — iterate to "good enough"

This is the talk's 4.5 → 6 → 9 loop. When the user asks to fix and re-review:

1. Fix only the accepted findings (fixing is a separate step the user asks for).
2. Re-run the same mode on the new diff. Judges see the previous report this time — the
   point is to check whether findings were resolved and whether fixes introduced new ones.
3. Show the scoreboard history: `Round 1: 4.5 → Round 2: 6.0 → Round 3: 9.0`.

**Stop rule — "a 9 is good enough":** stop when there are no open Critical/High findings
**and** the panel score is ≥ the config's `good_enough` (default 8.5). Do not chase a 10.
A harsh judge told to keep going will start manufacturing objections — the talk's "judges
wanting to kill each other." If a round produces only new Low/Preference findings, that's
the signal to stop.

Cap at `max_rounds` (default 3). If not at good-enough by then, stop and report what's
blocking; the problem is usually the spec, not the code.

## 7. Ship — production gate

Before anything goes in front of clients or the public, run `production-gate.md`. The talk's
point: vibe-coded tools are the car you wouldn't put on the highway; engineers rebuilt
David's code so nobody had to worry about **losing sensitive data, getting hacked, or
spending thousands on API keys**. The gate checks exactly those, plus reliability basics.
Its output is a hand-off list for whoever plays the engineer role — which may be you, with a
different hat on.

## 8. Log for calibration

Append one row per final finding to the repo's `.review-panel/ledger.md` (create if
missing), status `open`. See `calibration.md`.

---

## Hard rules

- No finding without a file path and line reference, and a concrete failure scenario.
- Zero findings is a valid, good result. Never pad.
- Judges ask instead of guessing: unknowns go under **Open questions**, not into findings
  dressed up as defects.
- The panel score is a progress meter. It never overrides findings: one supported
  Critical blocks at any score; unsupported objections block nothing at any score.
- Don't edit code during a review round.
