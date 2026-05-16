# FAIR-Band Pre-Flight Gate (Author-Side Mandate)

Bypass-resistant choke-point for the FAIR-band author-lane pickup discipline (primary codification: `.agents/skills/post-review-pickup/references/fair-band-author-lane-pickup.md`). The discipline is **skill-invocation-dependent** at the lane-discovery layer; this gate is the **PR-open choke-point** that enforces it regardless of which path the author took (`post-review-pickup`, `peer-role`, `ticket-intake`, `lead-role`, or direct `gh pr create`).

## The Mandate

Every PR you author MUST include a **FAIR-band stance declaration** in the PR body (near the top, after Self-Identification). The declaration takes one of these shapes:

- **In-band**: `FAIR-band: in-band [N/30 — current author count over last 30 merged]`
- **Under-target (lane-appropriate)**: `FAIR-band: under-target [N/30] — Self-Selection Rule 1 fires (under-band → bias toward author lane)`
- **Over-target (positive-ROI lane)**: `FAIR-band: over-target [N/30] — taking this lane despite over-target because [specific positive-ROI rationale: e.g., operator-direction, specialist-only ticket, time-critical incident-response]`
- **Over-target (yield candidate)**: This shape **FORBIDS PR-open**; per `post-review-pickup/references/fair-band-author-lane-pickup.md` Self-Selection Rule 4 (Over-target yield discipline), broadcast `[author-yield] <ticket #N>` A2A to `AGENT:*` naming the under-target peer(s) eligible for pickup before opening the PR. Allows the under-target peer to self-select per Rule 1 (flat-peer-team agency preserved; no assignment).

## Verifier Query

The canonical verifier query:

```bash
gh search prs --merged --repo neomjs/neo --limit 30 --sort updated --json author \
  | python3 -c "import json,sys;from collections import Counter; \
                print(Counter(p['author']['login'] for p in json.load(sys.stdin)))"
```

Yields per-peer merged-PR counts over the last 30. ±1 PR tolerance for race-condition windows when CI is mid-merge.

## Reviewer Enforcement

`pr-review/audits/fair-band-declaration-audit.md` defines the reviewer-side check. Missing/mismatched declaration → flag as Required Action.

## Why This Gate Exists (Bypass-Resistance)

Skill-invocation can be bypassed (RLHF helpful-assistant regression → direct `gh pr create`; ticket-already-assigned skipping ticket-intake; cross-harness bypass). The PR body shape mandate is the canonical choke-point all PR-creating workflows pass through. Mirrors `pull-request-workflow.md §1.1` Substrate-Mutation idiom + `§6.1.1` Consensus-Gate idiom: enforce body sections at PR-open time so reviewer-side V-B-A catches drift.

## Empirical Anchor

Operator-surfaced gap 2026-05-15 ~18:08Z post PR #11432 merge: *"pull request workflow assumes you HAVE a lane. what if you do not?"* + *"or if you create a pr bypassing the skill?"* — bypass-resistance extension via PR-open choke-point. Cycle-3 operator-challenge surfaced Map-vs-Atlas placement gap (PRR_kwDODSospM8AAAABAFemlA) — content extracted from `pull-request-workflow.md §1.3` to this granular payload per Map-vs-World-Atlas discipline.
