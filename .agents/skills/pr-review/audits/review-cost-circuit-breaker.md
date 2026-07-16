# Budgeted Review Closure

This payload closes expensive review loops without turning discussion size into a scope verdict. The managed `manage_pr_review` path enforces the limit before GitHub mutation; direct `gh pr review` / UI submission is an explicit bypass with post-submit telemetry only.

## Counter and cutover

- PRs with `createdAt` after `PullRequestService.reviewBudgetActivatedAt` are gated; older PRs are grandfathered to reviewer judgment.
- Every submitted `CHANGES_REQUESTED` object counts across heads, reviewers, and later retractions.
- Two ordinary RCs spend the budget. The managed path refuses mutation when its 100-review history projection is incomplete or truncated.
- Measure one PR or a corpus with `node ai/scripts/diagnostics/review-cost-meter.mjs <PR_NUMBER...>`; use `--json` for machine-readable output.

## RC2 closure

Post the closure packet as `COMMENTED`: consumer sweep; falsifier/property matrix; carried-vs-new finding census; truth-fold; semantic-surface freeze. Only the capability named by an existing RA may change after freeze; a property refinement within that surface is allowed. Then choose `APPROVED`, Maintainer Polish, guarded A+FU, or terminal Drop+Supersede. Never create a third ordinary RC by relabeling it.

Use the Micro-Delta template (`../assets/pr-review-micro-delta-template.md`) only when semantic review is complete and the remaining surface is mechanical-hygiene or metadata-drift.

## Terminal and bypass contracts

One terminal Drop+Supersede may pass the budget when the full/follow-up body carries the §9 disposition, source-coordinate falsifiers, salvage map, successor landing pad, and successor map citation. A second terminal review is refused.

Every managed Request Changes body receives `[review-budget-managed]`; body-only updates cannot erase it or downgrade a terminal D+S audit. `reviewBudgetOverrideReason` is the exceptional disclosure bypass. It must be a non-empty single line after the budget is exhausted; the service appends a durable `[review-budget-override]` block. Direct `gh`/UI bypasses must instead disclose `[review-budget-bypass] reason: ...`; workflow lint can only report malformed bodies after submission.
