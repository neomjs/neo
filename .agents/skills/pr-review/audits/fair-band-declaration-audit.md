# FAIR-Band Declaration Audit (Reviewer-Side Enforcement)

Reviewer-side enforcement primitive for the FAIR-band author-lane pickup discipline (primary codification: `.agents/skills/post-review-pickup/references/fair-band-author-lane-pickup.md`; author-side mandate: `.agents/skills/pull-request/references/fair-band-pre-flight-gate.md §1.3`).

## When This Audit Fires

When reviewing any PR, before assigning `[EXECUTION_QUALITY]` score, verify the PR body contains a **FAIR-band stance declaration** per the 4 shapes defined in `fair-band-pre-flight-gate.md`:

- In-band [N/30]
- Under-target [N/30] — Self-Selection Rule 1
- Over-target [N/30] — positive-ROI rationale (e.g., operator-direction, specialist-only, time-critical)
- Over-target (yield candidate) — **FORBIDS PR-open**; should not appear on an actually-open PR

## Verification Protocol

1. **Presence check**: PR body contains the declaration line near the top (after Self-Identification block)
2. **Accuracy check**: Run the canonical verifier query (`gh search prs --merged --repo neomjs/neo --limit 30 --sort updated --json author`) and confirm the declared count matches within ±1 PR race-condition tolerance
3. **Shape check**: Declaration uses one of the 4 canonical shapes; over-target shapes carry explicit rationale; over-target-yield-candidate FORBIDDEN as PR-already-open

## Required Action Template

If declaration is missing or mismatched:

> *"PR body missing FAIR-band stance declaration (or declaration mismatches live `gh search prs` query). Required: amend PR body with the canonical declaration shape per `pull-request/references/fair-band-pre-flight-gate.md` (in-band / under-target / over-target-with-rationale); over-target-yield-candidate FORBIDS PR-open until author-yield A2A is sent. Live verifier query: `gh search prs --merged --repo neomjs/neo --limit 30 --sort updated --json author` (±1 PR race-condition tolerance)."*

## Empirical Anchor

Operator-surfaced gap 2026-05-15 post PR #11432 merge — bypass-resistance choke-point extension. Cycle-3 operator-challenge surfaced Map-vs-Atlas placement gap → content extracted from `pr-review-guide.md §7.7` row to this granular audit payload.
