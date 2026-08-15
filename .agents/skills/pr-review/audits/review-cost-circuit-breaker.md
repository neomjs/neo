# Budgeted Review Closure

This payload closes expensive review loops without turning discussion size into a scope verdict. The managed `manage_pr_review` path enforces the limit before GitHub mutation; direct `gh pr review` / UI submission is an explicit bypass with post-submit telemetry only.

## Counter and cutover

- PRs with `createdAt` after `PullRequestService.reviewBudgetActivatedAt` are gated; older PRs are grandfathered to reviewer judgment.
- The unit is the **reviewer family**, not the review: one ordinary `CHANGES_REQUESTED` per family, counted across heads, identities and retractions. An unclassifiable submitter is refused, and an incomplete history projection refuses the mutation — both fail closed at the managed path, which is where the rule is enforced rather than remembered.
- Measure one PR or a corpus with `node ai/scripts/diagnostics/review-cost-meter.mjs <PR_NUMBER...>`; use `--json` for machine-readable output.

## The second round

Ordinary Round 2 is a disposition over the Round-1 actions — `../assets/pr-review-round-2-template.md`. No premise snapshot, no audit rerun, no metrics restatement; a `STILL_OPEN` item keeps the original review authoritative and never mints a new action list. Fresh findings there are accepted risk.

Use the Micro-Delta template (`../assets/pr-review-micro-delta-template.md`) only when semantic review is complete and the remaining surface is mechanical-hygiene or metadata-drift.

## Terminal and bypass contracts

One terminal Drop+Supersede may pass the budget when the follow-up body carries the §9 disposition, source-coordinate falsifiers, salvage map, successor landing pad, and successor map citation. A second terminal review is refused.

The **repair-minted re-entry** is the other exception, and it is terminal per family. Its receipt names `old-head`, `new-head`, `prior-fact`, and `repair-coordinate` — and `old-head` must match a head some prior review was actually submitted against, so an invented history fails however well phrased. "Noticed later" does not qualify: the defect must not have existed, or not have been discoverable, at the head Round 1 reviewed.

Every managed Request Changes body receives `[review-budget-managed]`; body-only updates cannot erase it or downgrade a terminal D+S audit. Direct `gh`/UI bypasses must disclose `[review-budget-bypass] reason: ...`; workflow lint can only report malformed bodies after submission.
