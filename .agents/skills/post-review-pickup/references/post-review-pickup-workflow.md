# Post-Review Pickup Workflow

Atlas entry for lifecycle-boundary pickup. The surrounding PR lifecycle documents
stay maps; the operational specifics live here.

## 1. The whole intent

After you finish a unit of work — a review posted, a PR opened or updated, an
implementation chunk done, a ticket filed, a blocked state exited — **pick up
another lane.**

1. **Never claim there is nothing to do.** There are 200+ open tickets, a mailbox
   that generates lanes on its own once peers are online (help requests, review
   requests), and two skills that mint effectively unbounded new work
   (`ideation-sandbox`, `tech-debt-radar`).
2. **Prefer a lane adjacent to your current context.** This is a cost lever, not
   a focus preference: your context is already loaded, and ~90% of a session's
   token cost is re-reading it. A distant lane forces a cold rebuild, and the
   same work costs ~2.3× more late in a session than early. Adjacency is the
   cheapest lane you will ever pick.
3. **Among several strong candidates, do not optimize the choice.** Ordering them
   costs more than picking the wrong one.

Everything below is the operational detail that makes those three concrete. The
stance behind them — that a done / blocked / merge-pending lane is never a stop —
is already in the always-loaded L3 firewall and is deliberately not restated here.

**Scope boundary:** this skill covers the EXIT from a blocked state. It is not a
tool for discovering or declaring a new one. If an active lane exposes a defect,
file or route the bug, then continue picking the next lane.

## 2. Sibling payloads (read on trigger only)

<!-- trigger: fresh-session/watchdog review intake with no active author lane → read ./pre-review-intake-lane-gate.md before loading /pr-review -->
- [`./pre-review-intake-lane-gate.md`](./pre-review-intake-lane-gate.md) — when
  role payloads must be read before lane choice, and when review-first is
  legitimate.

<!-- trigger: watchdog/night-shift wake, operator driver command, or lane-driver handoff → read learn/agentos/wake-substrate/NightShiftLeasedDriver.md -->
- `learn/agentos/wake-substrate/NightShiftLeasedDriver.md` — TTL, renewal, and
  direct-driver routing for autonomous windows. A lane-ownership contract, not a
  review-pickup variant.

<!-- trigger: lane-discovery moment → read ./author-concentration-detector.md -->
- [`./author-concentration-detector.md`](./author-concentration-detector.md) —
  authorship concentration is **telemetry, not policy**: no band, no scoreboard,
  no throttle. When it fires, route to making cold peers live; never slow a
  productive author.

## 3. Drain the lifecycle queue before opening a new lane

Order matters — it is what keeps peers unblocked:

1. own PR with `REQUEST_CHANGES` or an owed author-response;
2. a designated peer review / re-review request, unless (1) is active;
3. routing a reviewer to your own green PR;
4. only then a new lane.

Awareness wakes are live-state hints, not work. If the artifact is already
handled, merged, owned, or routed, acknowledge or mark it read rather than
duplicating. When reviewer scarcity is the bottleneck, prefer review and
coordination lanes over adding another PR to the queue.

## 4. Author-side: the RC-response is one atomic step

Fixup commits alone do NOT discharge it (#14735):

1. an author-response comment ON the PR — each RA addressed or contested, exact
   head hash;
2. an A2A re-review request to the reviewer, **waking-required** (RC-class must
   wake);
3. only then is the lane free to move.

## 5. PR-state freshness gate

Before any report/A2A/lane declaration names PR review or merge status, read
live GitHub; wakes are hints:

```bash
gh pr view <N> --json state,mergedAt,baseRefName,reviewRequests
```

For every **other** PR the report names, `list_pull_requests({believedOpen: […]})`
falsifies terminal state in one call; it returns `state`/`mergedAt` only, so the
read above stays required wherever seats matter.

A non-empty `reviewRequests` blocks even at `APPROVED`; name each seat. For
stacked PRs name base readiness. Relay the review verdict, not the flattened
enum. `validateMergeReady.mjs` remains the predicate; canonical
`[merge-eligible]` additionally cites the current positive B-prime observation
marker. Without one use `[merge-readiness-uncertified][no-positive-observation]`;
cloud mode uses `[merge-readiness-uncertified][issuer-unavailable:cloud-mode]`.

## 6. Before claiming a lane

- targeted reviews where you hold the live requested seat; exceptional 1h
  unclaimed pickup must pass `pre-review-intake-lane-gate.md` at review-start;
- assigned issues and your own PR follow-ups;
- recent `[lane-claim]` / `[lane-override]` A2A for collision state;
- open unassigned lanes, excluding `-label:not-code-ready -label:epic`;
- scan **comments and prior-PR closure**, not just the body — a not-ready state
  usually hides there. Mark it `not-code-ready` rather than re-surveying it.

## 7. Deferring a known lane

**A defer needs a named falsifier; a second defer of the same lane needs a
decision.**

- Legitimate defer: name the artifact to re-read, the check to run, the peer
  signal awaited, or the external unblock condition. "Do it fresh next turn" or
  "await steer" name nothing.
- Deferring the same positive-ROI lane twice while busy elsewhere is drift.
  Resolve it: execute, hand off to a named peer with the collision state, or
  downgrade it with evidence that it is no longer positive-ROI.

Surface the decision where lifecycle decisions already surface. Never build
dedicated telemetry substrate for it.

## 8. Emitting lane-state

Emit the human-readable prose line — peers and the operator read it, and it costs
one line:

```text
lane-state: next-lane (picking up ticket #NNNN)
lane-state: next-lane (claiming #NNNN as primary reviewer)
lane-state: next-lane (PR #NNNN at human merge gate; picking up unrelated #MMMM)
```

**The fenced machine block is emitted ONLY when `stopHook.laneContinuation` is
enabled.** Its sole consumer is `parseLaneState()` in the turn-end hooks; with
the leaf off — the shipped default — nothing reads it, so emitting it is pure
waste. Do not emit it by habit; do not treat its absence as a missing
deliverable. When the leaf IS on it is required, and prose alone does not satisfy
it:

```lane-state
{"laneContinuation":"next-lane","namedGates":[{"ref":"PR #NNNN","checkedAt":"YYYY-MM-DDTHH:mm:ssZ"}]}
```

Before an implementation `[lane-claim]`: `preBriefSession({ticket})` (plus a
`query_raw_memories` failure-mode sweep if un-graphed) → a one-line brief.

## 9. Broadcast-suppressed coordination

Operator suppression of `AGENT:*` broadcast is a coordination-shape constraint,
not a lack of work. Avoid the suppressed channel exactly as instructed, use the
authorized peer DM as the lane-claim substitute, and name the fallback in the A2A
body so future readers know why the canonical path was not used. If no safe
channel exists, route that as the blocker and take a lane that does not depend on
it.

## 10. Integration points

- `pr-review-guide.md §11` — reviewer-side map pointer into this skill.
- `pull-request-workflow.md §6.3` — author-side map pointer.
- `review-response-protocol.md §14` — author-side commentId handoff SSOT.
- `pr-review-guide.md §10` — reviewer-side commentId handoff SSOT.

## 11. Anti-patterns

| Anti-pattern | Why it harms |
|---|---|
| Naming a PR's merge state from a wake, a prior summary, or your own earlier sentence | Wakes and recollection are stale by construction; this is how false merge-ready claims reach the operator |
| Claiming a review you were not assigned | Collides with the assigned reviewer and distorts cross-family seat accounting |
| Fixup commits without the author-response comment + waking A2A | Leaves the reviewer unaware; the RC cycle silently stalls |
| Treating operator-suppressed broadcast as work-stop | Confuses coordination visibility with implementation authority |
| Duplicating this content into the PR lifecycle maps | Violates the Map vs Atlas split and raises routine context load |
