# Cycle-1 Premise Pre-Flight Audit

Use this audit only when the map trigger in `pr-review-guide.md` §9.0 fires or a Cycle-1 PR feels structurally non-iterable. The purpose is to decide whether `Request Changes` would wrongly normalize an unmergeable premise as an iterative path.

## Why This Exists

The four Strategic-Fit outcomes in `pr-review-guide.md` §9 were originally anchored on after-N-cycles failures such as PR #10610 -> #10611 and the PR #10607 eight-cycle pattern. Those anchors catch sunk-cost iteration after review churn has already happened.

PR #11083 exposed the missing Cycle-1 case: the wrong premise was visible before any iteration. The Cycle-1 review used Request Changes with five iterative Required Actions, even though the substrate-correct shape was a single Drop+Supersede close recommendation. RA1 ("upstream Discussion needs author-graduation") was structurally not-iterable on the PR; that self-contradiction is the diagnostic.

## Trigger Catalog

If any trigger below fires, default to Drop+Supersede framing: one close/restart Required Action, not a multi-item iteration list.

| Trigger | Diagnostic question |
|---|---|
| Premise-invalid | Is the PR's stated premise false, such as claiming to resolve a ticket or implement a feature whose substrate has a different shape? |
| Upstream not graduated | Does the PR depend on a Discussion, parent ticket, or Epic that has not reached its required graduation or closure state? |
| Author bypassed | Did the author bypass a specific authority boundary, such as self-marking another peer's Discussion as graduated or crossing `peer-role` non-execution without handoff? |
| Anti-pattern instantiation | Does the change instantiate a pattern Neo doctrine forbids, such as named-maintainer orchestrator/worker mapping, framework-category drift, or banned shell editing? |
| Strategic-misalignment | Does the work conflict with active roadmap direction, reserved lane ownership, deprecated subsystem direction, or an operator halt? |
| Better-existing-substrate | Does existing code, Memory Core, or KB evidence already solve the problem, making the PR reinvention? |
| Source-ticket stale/currency-risk | Is the linked ticket older than the stale workflow threshold, stale, `no auto close`, or plausibly superseded, and did the reviewer check newer tickets, newer PRs, merged PRs without close keywords, active epics, recent Discussions, and current source/docs/tests before accepting it as authority? |

## Source-Ticket Currency Rule

Age and exemption state are risk signals, not verdicts. For source-ticket stale/currency-risk, the reviewer must prove current authority before approval: newer tickets, newer or merged PRs without close keywords, active epics, recent Discussions, and current source/docs/tests can supersede a still-open ticket.

If currency is unverified or contradicted, request source-ticket refresh or Drop+Supersede/restart instead of iterating implementation details. This is the reviewer-side companion to #10758; do not duplicate #10758's intake-side age-band procedure here.

## Bias Defended Against

Velocity-Preservation Bias: preferring iterative paths that salvage work-already-done over decisive restart paths, even when restart is substrate-correct.

Amplifiers:

- Auto Mode "prefer action over planning" reads as "iterate now."
- `peer-role` pressure reads as "find things to fix."
- Green CI makes merge feel proximate.
- Partial correctness makes salvage feel efficient.

The cost is normalizing process violations as iteratable rather than abandonable.

## Empirical Anchor

PR #11083, closed unmerged on 2026-05-10, is the anchor. Review comment `IC_kwDODSospM8AAAABBxjTZw` documented five iterative Required Actions, while RA1 pointed at upstream Discussion graduation. That mismatch between RA shape and Request Changes framing is what this audit prevents.

## Disposition

- `pr-review-guide.md` §9.0: `compress-to-trigger`
- This file: `move`
- Tag: `DISCIPLINE-ONLY`

This keeps the loaded map short while preserving the case study, trigger catalog, and bias rationale for reviewers who actually hit the edge case.
