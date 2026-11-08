# Report Template

Fill every section. Write "None" rather than deleting a section.

```markdown
# Review Panel — <app> — <scope: PR #/branch/commit range, or "Audit: <slice>">

**Verdict: SHIP | FIX FIRST | BLOCK** — <one sentence why>
Mode: Quick | Standard | Deep  ·  Round <n> of <max_rounds>  ·  <date>
Intent reviewed against: <1–2 sentence spec from the brief>

## Scoreboard

| Judge | Score | Model | One-line call |
|---|---|---|---|
| Skeptic | 6 | … | … |
| Advocate | 8 | … | … |
| Correctness | 7 | … | … |
| Security | 5 | … | … |
| Maintainer | 8 | … | … |
| **Panel (median)** | **7.0** | | |

Round history: R1 4.5 → R2 6.0 → R3 7.0   (good-enough target: 8.5)

| Dimension | Score (1–5) |
|---|---|
| Correctness | |
| Security | |
| Maintainability | |
| Product fit | |
| Operational readiness | |

## Blocking findings
<Critical and High findings that drive the verdict, rubric format, most severe first>

## Other findings
<Medium, then Low. Preferences last, collapsed to one line each>

## Open questions
<Only ones whose answer would change a ruling>

## Disagreements
<Finding — Judge A says … / Judge B says … — what would settle it>

## Accepted tradeoffs
<From the advocate, as upheld by the referee>

## Coverage gaps
- Validation: <ran / not run — why>
- Files read in full vs skimmed: …
- Critical paths not covered (audit mode): …
- Independence: <parallel subagents / sequential passes>
- Anything else a reader might assume was checked but wasn't

## Dismissed
<Finding title — judge — reason dismissed. Used for calibration.>
```

## Style rules

- Lead with the verdict. A reader who stops after line 3 should know what to do.
- Findings are concrete and short. The scenario is the most important field.
- No praise padding, no summary of what the code does unless it's needed to understand a
  finding.
