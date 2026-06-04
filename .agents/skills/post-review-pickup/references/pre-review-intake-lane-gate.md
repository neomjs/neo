# Pre-Review Intake Lane Gate

This payload governs the moment before an agent accepts its first PR review /
re-review request after fresh boot, session recovery, or watchdog wake while no
author or implementation lane is active.

The goal is lane-order correctness: pick a positive-ROI author lane first when
that is the right move, then review peer PRs after the PR is opened or while CI
is pending. This is not a quota, blame, or forced-assignment mechanism.

## Trigger

Use this gate when all are true:

1. A PR review or re-review request is available.
2. The current session has no active author lane, implementation branch, or
   self-assigned ticket in progress.
3. No human-directed urgent review instruction overrides lane discovery.

If the agent already has an open PR waiting on CI, use
`pull-request/references/ci-green-review-routing.md` instead: peer review during
CI wait is healthy as long as the author re-checks the current PR head after.

## Protocol

1. **Mailbox + authority check:** read unread A2A, then verify the live PR /
   issue state before asserting urgency or ownership.
2. **Role-context check:** if `/lead-role` or `/peer-role` is active or
   explicitly invoked, read that role payload before choosing the lane. Do not
   synthesize role state when no real trigger exists.
3. **Lane discovery:** inspect assigned-to-me, fresh operator focus, and open
   unassigned positive-ROI tickets. Prefer an author lane when one is
   claimable without violating collision checks.
4. **Decision:** either claim the author lane and proceed through
   `ticket-intake`, or record a review-first rationale before loading
   `/pr-review`.

## Legitimate Review-First Rationale

Review-first is allowed when one of these is true:

- The operator explicitly asked for the review now.
- The review is urgent, security-sensitive, or blocks a peer's already-active
  author lane.
- Lane discovery found no positive-ROI author lane claimable in the current
  turn, and the survey is named in the handoff.
- The agent's own PR is already open and CI is pending; review work is being
  done as CI-wait utilization.

Use explicit wording:

```text
review-first rationale: <why review precedes author-lane pickup>
```

## Halt Boundary

Do not halt merely because no operator assigned a lane. A halt-state is valid
only after the backlog self-survey in `post-review-pickup-workflow.md §5`
passes and the blocker is named.

## Anti-Patterns

| Anti-pattern | Why it harms |
|---|---|
| Entering `/pr-review` from fresh boot without checking for an author lane | Recreates reviewer-only cycles before post-review author-lane pickup can fire |
| Treating the author-concentration detector as a scoreboard or throttle | Replaces liveness telemetry with quota pressure — the exact FAIR-band-as-policy failure mode that was retired |
| Loading `/lead-role` or `/peer-role` without a real trigger | Creates fake hierarchy or fake convergence work |
| Blocking all reviews until a PR exists | Breaks urgent peer-unblock and human-directed review paths |
