# Review-Request Liveness Gate

Source: #13522, extracted from #10777's unclaimed-review-queue escalation.

This payload governs the active-window state after a reviewer has already been
assigned to a PR. It complements the pull-request workflow's 24-hour silence
timeout; it does not replace that hard fallback.

## Failure Mode

`reviewRequests` proves that a reviewer was routed. It does not prove the review
gate is live.

The failure this gate prevents:

- an author treats "reviewer assigned" as coordination-complete while clean PRs
  sit with no review, decline, handoff, or blocker signal;
- a reviewer reaches lifecycle boundaries while assigned review requests remain
  invisible to their terminal state;
- the swarm opens more implementation PRs into the same reviewer bottleneck
  instead of making the existing review queue move.

This is liveness routing, not fairness policy. No quotas, scoreboards, central
assignment, or "slow the productive author" rule are introduced.

## Signals

A routed review request is live when at least one visible state transition
exists after routing:

- formal review posted;
- reviewer declines and unassigns themselves, or asks the author to unassign;
- reviewer hands off to a named alternate reviewer;
- reviewer sends `blocked-task-state` with a concrete blocker;
- reviewer sends an explicit CI-hold / scope-hold when the PR is not reviewable
  yet.

A routed review request is stale in the active window when the PR is clean/green,
has a named reviewer, and none of the visible transitions above exists while the
reviewer or author continues other lifecycle work.

## Author-Side Protocol

When the author has multiple clean own PRs with reviewers assigned and no visible
reviewer transition in the active window:

1. Stop treating additional implementation PRs as the highest-value next lane.
2. Send a targeted, unsuppressed A2A to each assigned reviewer asking for one
   state transition: review, decline/unassign, handoff, or blocked-task-state.
3. Prefer non-reviewer-piling work until the stack moves: peer reviews,
   ticket-only analysis, issue/body cleanup, or substrate evidence.
4. If a reviewer remains completely silent for the existing 24-hour timeout,
   use the pull-request workflow's silence-timeout path.

One stale PR can still be urgent enough to route, but the systemic gate fires
when the author is building a stack of routed-but-unmoving PRs.

## Reviewer-Side Protocol

Before a reviewer declares `verified-empty`, they must check whether any open PR
is review-requested to their GitHub identity.

If assigned review requests exist:

- green/current-head PR: review it, decline/unassign, hand it off, or declare a
  concrete blocker;
- red/pending PR: use the existing CI hold/fail-fast path rather than a full
  review;
- wrong-family or overloaded reviewer: decline/unassign or hand off explicitly.

An assigned review request invalidates `verified-empty` until one of those state
transitions is visible.

## A2A Template

Use an actionable direct message. Do not set `wakeSuppressed`.

```text
Subject: [review-liveness][#PR] claim / decline / handoff requested

V-B-A at <ISO time>: #PR is <CLEAN/green>, review-requested to <reviewer>,
and has no review / decline / handoff / blocker signal after routing.

Requested action: choose one visible state transition:
- review now;
- decline/unassign with reason;
- hand off to <named peer>;
- send blocked-task-state with the concrete blocker.

This is review-liveness routing, not central assignment or throughput pressure.
```

## Terminal Guard

`verified-empty` is invalid when either condition is true:

- the active identity has assigned review requests still pending with no visible
  state transition;
- the active author has multiple clean own PRs with peer review requested and no
  reviewer transition in the active window, but has not performed the targeted
  liveness routing above.

Use `next-lane (review-liveness routing for #PR...)`, `human-gate`, or
`blocked-task-state` instead, depending on the verified state.

## Anti-Patterns

| Anti-pattern | Why it fails |
|---|---|
| Opening another same-reviewer implementation PR while older green PRs have no reviewer signal | Adds load to the bottleneck instead of moving it |
| Broadcasting a generic "reviewers needed" note | Does not create owner-visible state; use targeted reviewer messages |
| Counting `reviewRequests` alone as coordination complete | Assignment is an invitation, not a response |
| Treating this as a fairness band | Reintroduces retired quota logic; the goal is liveness |
| Waiting only for the 24-hour timeout while the reviewer is demonstrably active | Misses active-window liveness and burns operator attention |
