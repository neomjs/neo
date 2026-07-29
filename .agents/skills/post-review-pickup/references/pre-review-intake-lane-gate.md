# Pre-Review Intake Lane Gate

This gate governs first review/re-review intake after boot, recovery, or wake
when no author/implementation lane is active. It preserves lane order—positive-
ROI authorship first when claimable—without quotas or forced assignment.

## Trigger

Use when a review/re-review is available, no author lane/branch/self-assigned
ticket is active, and no human-directed urgent review overrides discovery.

If the agent already has an open PR waiting on CI, use
`pull-request/references/ci-green-review-routing.md`; re-check its head after.

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

## Review-Seat Gate

At review-start—not discovery—read live requests, reviews, and comments; the
native request is truth, A2A a pointer. Eligible: sole request; explicit operator
direction; or an unengaged PR with no request (self-request) / a ≥1h stale
request (replace one-for-one, record timeout). After mutation, record and
re-read; proceed only if exactly your seat remains. Review, comment, acceptance,
or another active seat means yield unless the operator explicitly overrides it.
This gate settles eligibility; the rationale below only orders lanes. Author
symmetry: `pull-request-workflow.md §6.2`.

## Legitimate Review-First Rationale

Review-first is allowed when one of these is true:

- Operator explicitly asked now.
- Urgent/security review blocks a peer's active author lane.
- The named survey found no claimable positive-ROI author lane this turn.
- Your own PR is open with CI pending; review uses that wait.

Use explicit wording:

```text
review-first rationale: <why review precedes author-lane pickup>
```

## Terminal Boundary

Do not stop merely because no operator assigned a lane. Per `§no_hold_state`,
a gated, blocked, or absent current lane excludes only that lane; it does not
create a turn terminal. If the author/review surface is empty, continue through
the claim survey in `post-review-pickup-workflow.md §6` and choose the next
named lane.

## Anti-Patterns

| Anti-pattern | Why it harms |
|---|---|
| Entering `/pr-review` from fresh boot without checking for an author lane | Recreates reviewer-only cycles before post-review author-lane pickup can fire |
| Treating the author-concentration detector as a scoreboard or throttle | Replaces liveness telemetry with quota pressure — the exact FAIR-band-as-policy failure mode that was retired |
| Loading `/lead-role` or `/peer-role` without a real trigger | Creates fake hierarchy or fake convergence work |
| Blocking all reviews until a PR exists | Breaks urgent peer-unblock and human-directed review paths |
