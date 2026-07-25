# Post-Review Pickup Workflow

This payload is the Atlas entry for post-review-cycle pickup discipline. Keep
the surrounding PR lifecycle documents as maps: they identify when this skill
fires, but the operational matrices live here so the high-level workflow files
do not accumulate edge-case payload.

## 1. Trigger

Use this skill immediately after ANY lifecycle event that closes a discrete unit
of work and creates a state-transition boundary. The skill scope expanded from
"PR review cycle only" to "any lifecycle-event boundary" via #11455 / Discussion
#11423 Option B.1-prime — single skill, broader trigger surface, kept to
avoid skill-sprawl (no new `state-transition` skill per #11424 Description-Router
hardening).

Canonical trigger events (use this skill after any of these):

- **Reviewer post-handoff**: posted a substantive PR review, chained a formal
  GitHub review state when required, and sent the A2A commentId handoff.
- **Author post-handoff**: posted a review-response comment with fixup commits
  and sent the author-side A2A commentId handoff.
- **Post-implementation completion**: finished a discrete implementation chunk
  (a feature slice, a bug fix, a refactor) before opening the PR — that
  completion IS a lifecycle event; do not silently idle between implementation
  and PR-open.
- **Post-PR-open/update**: just opened a PR, pushed a fixup, or otherwise
  surfaced a discrete PR-lifecycle artifact. The PR is now in cross-family
  review-cycle ownership; pick up the next independent lane.
- **Post-ticket-create**: just filed a ticket (via `create_issue`). The ticket
  is on the team board for priorization; pick up the next assigned/claim-eligible
  lane (or execute on the ticket if it's the lane you'll claim).
- **Post-blocked-state-resolution**: just exited a `blocked-task-state` (the
  blocker resolved, the dependency landed, the missing input arrived). The
  exit IS the lifecycle event; pick up the next forward-motion lane rather
  than re-evaluating the no-longer-blocked task as if fresh.
- **Pre-review intake (fresh-session/watchdog wake)**: fresh session, session
  recovery, or watchdog wake presents a PR review / re-review request while the
  agent has no active author or implementation lane — see §1.5 Pre-Review Intake
  Gate (#11610 / #11609).

The goal is to prevent silent idle at ANY of these boundaries AND to prevent
pre-review reviewer-only cycles. The handled artifact is now owned by the next
actor in that cycle (or the team board for ticket creation); unrelated ready
lanes can proceed in parallel.

If a watchdog or night-shift wake is paired with an operator-suppressed
`AGENT:*` broadcast channel, treat that as a coordination-shape constraint, not
as lack of work. Use the operator-authorized reachable peer DM as the lane
coordination substitute and continue the lane-discovery protocol below.

**Scope boundary**: this skill covers the EXIT from a previously blocked state
(forward-motion resumption). It must not be used to search for or declare a new
blocked state during lane discovery. If an active lane exposes a defect or
dependency, capture it with the governing bug/follow-up signal, then continue
the next-lane cycle.

## 1.5 Pre-Review Intake Gate

<!-- trigger: fresh-session/watchdog review intake with no active author lane → read ./pre-review-intake-lane-gate.md before loading /pr-review -->

Primary codification of the pre-review intake lane-discovery gate:
[`./pre-review-intake-lane-gate.md`](./pre-review-intake-lane-gate.md).
It defines when role payloads must be read before lane choice, how to survey
positive-ROI author lanes, and when a review-first rationale is legitimate.
This is a trigger-ordering guard, not a quota or blame mechanism.

## 1.6 Night-Shift Leased Driver Gate

<!-- trigger: watchdog/night-shift wake, direct operator driver command, lane-driver handoff, or repeated no-progress cycles -> read learn/agentos/wake-substrate/NightShiftLeasedDriver.md before declaring no-delta or any turn-terminal -->

Night-shift driver handling is a lane-ownership contract, not a generic
review-pickup variant. The linked wake-substrate document defines the TTL,
renewal, direct-driver routing, and no-idle obligations for autonomous windows.

## 1.7 Three-Heartbeat Critical Failure Threshold

A delivered heartbeat or watchdog pulse is ignored when the recipient ends the
turn without progress evidence: lane claim, implementation/review/PR update,
targeted blocker route, verified handoff, ticket triage/retraction,
ideation/epic-resolution artifact, or an explicit recovery escalation. A
freshly verified blocker with a named next probe counts as progress evidence;
repeating an unchanged pause, halt, or no-delta reason does not.

An ignored heartbeat is already a failure on the first occurrence. The threshold
does not permit two passive misses; it marks the third consecutive miss as a
critical recovery event.

Three consecutive ignored pulses in the same active goal/session are a critical
failure, not a legitimate terminal. On the third pulse, the agent MUST stop
repeating no-delta/paused/halt prose, name the missed lane or goal, choose one
concrete recovery action, and emit a `[critical-failure]` A2A signal with the
evidence chain. Repeating the same unchanged no-delta reason does not reset
the counter.

This threshold governs recipient behavior after a heartbeat is delivered. It is
separate from upstream wake-decision skips (`active AND idle AND ready`), safety
gates, or disabled wake substrate paths.

## 2. Reviewer Pickup Matrix

After completing the reviewer-side handoff, the reviewer MUST choose one of
these next states before ending the turn:

| Review verdict just posted | Next pickup target |
|---|---|
| `Approve` or `Approve+Follow-Up` | Treat the PR as at the human merge gate per `AGENTS.md §0`; then pick up the next assigned ticket, next implementation lane, follow-up ticket creation, or another review request. If the verdict named non-blocking follow-ups and the reviewer owns them, file or claim that follow-up before any terminal. |
| `Request Changes` | The author owns the response cycle. Do not wait on that PR unless the author immediately pings back with a blocker. Pick up a different lane: another PR review, an assigned ticket, or a follow-up ticket surfaced by the review. |
| `Drop+Supersede` | If the reviewer owns the superseding work, enter that ticket-create / ticket-intake / PR lane immediately. If another agent owns it, send the handoff and pick up the next unrelated lane. |

After the matrix action, emit the explicit `lane-state:` form from §2.5. A
human-gated PR is lane-local state, not a turn terminal: broaden the survey
through backlog, tech-debt, and ideation surfaces until a next lane is selected.
Do not search for a blocker to justify stopping; if the active lane exposes a
real system defect, file or route the bug ticket, then continue lane selection.

**PR-State Freshness Gate:** any `lane-state:`, A2A broadcast, or report that names a PR's
review/merge status MUST first run live `gh pr view <N> --json state,mergedAt,baseRefName`;
wakes are hints, not cache. For stacked PRs, also name base readiness; a dirty/stale
base is routable, not `human-gate` / `verified-empty`. Relay the review body's §9 verdict,
not the flattened enum. Also fetch `reviewRequests`: a non-empty list is not strict-merge-ready
even at `reviewDecision=APPROVED` — name the reviewer(s) as the remaining gate until each is
disposed. `validateMergeReady` (ai/scripts/lifecycle) encodes this contract.

## 2.5. Mandatory Lane-State Emission at Every Lifecycle Boundary

Per #11455 AC, every lifecycle boundary (reviewer post, author response,
post-implementation, PR open/update, ticket create, blocked-state exit) emits
the human-readable prose form:

```text
lane-state: next-lane (picking up ticket #NNNN)
lane-state: next-lane (claiming #NNNN as primary reviewer)
lane-state: next-lane (filing follow-up ticket for friction surfaced in #NNNN)
lane-state: next-lane (PR #NNNN at human merge gate; picking up unrelated ticket #MMMM)
lane-state: next-lane (filed/routed blocker bug #NNNN; picking up unrelated ticket #MMMM)
```

**The fenced machine block is emitted ONLY when `stopHook.laneContinuation` is
enabled** (#15877). Its sole consumer is `parseLaneState()` inside the turn-end
hooks; with the leaf off — the shipped default — nothing reads it, so emitting it
is pure waste in every turn's output budget. Do not emit it by habit, and do not
treat its absence as a missing deliverable. When the leaf IS enabled, the block
is required and takes this shape:

```lane-state
{"laneContinuation":"next-lane","namedGates":[{"ref":"PR #NNNN","checkedAt":"YYYY-MM-DDTHH:mm:ssZ"}]}
```

The prose form stays unconditional: it is coordination substrate peers and the
operator actually read, and it costs one line. Only `next-lane` is normal here.
"Holding", "standby", "nothing actionable", "idle", bare `paused`,
`verified-empty`, `human-gate`, and blocker-as-exit-ramp are not turn terminals
(§5) — that stays true of the prose form regardless of the leaf, because it is a
discipline about what you may CALL a terminal, not about what the hook parses.
When the machine block IS in play, `parseLaneState()` reads only the fenced
block, so prose alone does not satisfy it: no gate → `namedGates: []`; merge
claim → `"mergeClaim":true,"field":"mergedAt"`.

## 2.6. Deferring a Known Lane

**A defer needs a named falsifier; a second defer of the same lane needs a
decision.** That is the whole discipline.

- Legitimate defer: name the artifact to re-read, the check to run, the peer
  signal awaited, or the external unblock condition. Politeness, "do it fresh
  next turn", or "await steer" name nothing and are not evidence.
- Deferring the same known positive-ROI lane a second time while busy elsewhere
  is drift. Resolve it: execute, hand off to a named peer with the collision
  state, or downgrade it with the evidence that it is no longer positive-ROI.

Surface the decision where lifecycle decisions already surface (an A2A note or
graph node). Never build dedicated telemetry substrate for it.

*Compressed 2026-07-25 from a 3.1KB ledger/lease specification — typed event
keys, a deferral counter, threshold-immutability rules, and a four-verb lease
response taxonomy — that was authored for a weaker model generation and was
never mechanized (it self-described as "telemetry-routes-not-gates" and deferred
its own implementation). The discipline above is what the specification was
protecting; the choreography around it was cost without a consumer. Full prior
text is in git history and its source Discussion.*

## 2.7. Pre-Implementation Brief Gate

Before an implementation `[lane-claim]`: `preBriefSession({ticket})` (+ `query_raw_memories` failure-mode if un-graphed) → a one-line brief. Mandatory; skip trivial-familiarity. Detail: #9961.

## 3. Author Pickup Matrix

The author-side RC-response is **one atomic step, not three optional** (#14735);
fixup commits alone do NOT discharge it:

1. author-response comment ON the PR — each RA addressed/contested, exact head hash;
2. A2A re-review request to the reviewer, **waking-required** (RC-class MUST wake, wake-policy #14576);
3. only then lane-state moves off `own-pr-changes`.

Then choose one of these next states before ending the turn:

| Author state after response | Next pickup target |
|---|---|
| RC-response discharged (all three above) | Start the next assigned ticket, draft the next ready PR, file the follow-up ticket discovered during the response, or review a separate PR if that is the current lane. |
| Current PR still blocks all local work | Blocks only that lane; survey lifecycle/backlog/tech-debt/ideation until a next lane is selected (§5). "No independent lane assigned" + unqueried backlog is NOT a terminal. |
| Reviewer feedback produced a superseding direction | Enter the superseding ticket / PR creation lane if the author owns it; otherwise hand off the supersede target and pick up the next unrelated lane. |

## 4. Author-Concentration Detector (Telemetry)

<!-- trigger: lane-discovery moment (post-review, post-completion, fresh-boot, peer-role-exit) → read ./author-concentration-detector.md for the telemetry signal (NOT a band/scoreboard/throttle) -->

Authorship balance is **telemetry, not policy** (FAIR-band-as-policy retired per Epic #12440 → #12443). The author-concentration detector is defined in [`./author-concentration-detector.md`](./author-concentration-detector.md): a merged-window concentration signal (open-pipeline as amber) read at lane-discovery, with **no band, no scoreboard, no throttle, and no PR-body declaration**. Flat-peer-team self-selection is preserved; when concentration fires it is a liveness/capability signal (route to making cold peers live — the sibling legs #12444 / #12445 / #12446), never a reason to slow the productive author.

## 5. The Cycle Is the Operating Model; Turn-Terminals Are Externally-Falsifiable

Lineage: #10970 established lifecycle pickup; #11165 tightened the backlog
self-survey; #11221 closed stated-intent-without-execution; #11669 adds the
broadcast-suppressed fallback below; #12632 (Discussion #12630) deleted the
holding vocabulary and made the cycle the operating model.

**Operating model — the cycle.** At every turn boundary, drain the actionable
lifecycle queue before opening a new lane: (1) own PR `REQUEST_CHANGES` or
required author-response; (2) designated peer review/re-review, unless (1) is
active; (3) own green PR review routing; (4) only then next lane. Awareness
wakes are live-state hints, not work by themselves; if the artifact is already
handled/merged/owned/routed, acknowledge or mark read instead of duplicating
work. If reviewer scarcity is the bottleneck, prefer coordination, review, or
cleanup lanes over opening another implementation PR into the same queue.

The own-open-PR cap governs which next step to choose, not whether lifecycle
work happens. This is liveness, not throughput: no contribution counter, per-wake
ledger, or N-PR quota.

**Turn-boundary rule:** lifecycle clearance is not a terminal. The default
outcome is `lane-state: next-lane (...)`: survey live lifecycle work, then the
repository backlog, tech-debt-radar, and ideation surfaces until a positive-ROI
lane is selected. `blocked-task-state` is not a lane-discovery result: if an
active lane uncovers an external blocker, create or route the bug/follow-up that
captures it, then pick another lane. Operator-requested pause is an external
falsifier; context exhaustion routes to `session-sunset` only after a concrete
cap warning, recurring factual degradation, repeated re-reads, stable-artifact
drift, or measured substrate-error increase. Otherwise continue the cycle.

### Gated Own Lanes Are Not Turn Terminals

Own PRs/lanes blocked on human merge, reviewer response, CI, or operator
`CHANGES_REQUESTED` exclude only those lanes — not proof there is no work; the
default next move is an independent backlog lane, review request, or co-design
surface after collision checks. Minimum survey shape before filing/routing a
blocker bug from the active lane:

- targeted review / re-review requests **where you are the assigned github
  reviewer** (verify: `gh pr view <N> --json reviewRequests`) — do not claim a PR
  review you were not assigned to; clean assigned requests need
  review/decline/handoff/blocker before new work;
- assigned issues and currently self-authored PR follow-ups;
- recent `[lanes-available]`, `[lane-claim]`, and `[lane-override]` A2A signals
  for collision state;
- open unassigned current-epic / substrate lanes — exclude `not-code-ready`
  and `epic` parents (`-label:not-code-ready -label:epic`);
- broader non-conflicting backlog if the current-epic surface is empty.

Before claiming, scan **comments + prior-PR closure**, not just the body — a
not-ready state often hides there; mark it `not-code-ready` (see `ticket-intake`),
don't re-survey it.

If any positive-ROI candidate survives that survey, emit `lane-state: next-lane
(...)` and start the intake/claim path. If none survives, broaden to
tech-debt-radar / ideation / general backlog and create the missing lane. A
human-gated own PR plus an unqueried broader backlog is the stale-yield/idle-out
failure mode that Epic #12440 rejects.

### Broadcast-Suppressed Coordination Fallback

`AGENT:*` broadcast is the canonical lane-visibility path, but temporary
operator suppression of broadcast is not by itself a turn-terminal. If the
operator suppresses broadcast to protect an unstable peer harness, the agent MUST:

1. Avoid the suppressed peer / channel exactly as instructed.
2. Use the operator-authorized reachable peer DM as the lane-claim /
   lane-coordination substitute.
3. Name the fallback in the A2A body so future readers understand why the
   canonical broadcast path was not used.
4. Continue the broad backlog / tech-debt / ideation survey before filing or
   routing any blocker bug.

If no safe coordination channel exists, file or route that as the blocker bug
and continue with a lane that does not depend on the broken channel. Coordination
failure is a defect signal, not permission to idle.

Lead-role and peer-role agents are explicitly expected to **self-select from the backlog and announce the lane pickup** rather than treating absence-of-operator-direction or absence-of-broadcast as legitimate halt. Per AGENTS.md §15.6: *"Proactively select high-value tickets from the backlog AND begin the lane in the same turn."*

### Substrate-evolution-flywheel reality

Operator-named substrate-work-supply for lead/peer agents: v13 Project board + repository backlog (300+ items each); opening PRs surfaces friction → new tickets; `tech-debt-radar` / `industry-friction-radar` surface debt + external-precedent friction as new tickets on each re-invocation (long loop). **The probability of zero positive-ROI work available is "as close to zero as it gets" per operator-framing.** Defaulting to any turn-terminal at a non-externally-falsifiable trigger is deference-slip.

Do not broadcast generic "idle" state. If an active lane exposes a blocker,
file or route the bug with a targeted A2A shape, then continue with another
lane.

## 6. Integration Points

- `pr-review-guide.md §11` is the reviewer-side map pointer into this skill.
- `pull-request-workflow.md §6.3` is the author-side map pointer into this
  skill.
- `review-response-protocol.md §14` remains the author-side commentId handoff
  source of truth.
- `pr-review-guide.md §10` remains the reviewer-side commentId handoff source
  of truth.

This is the public successor anchor for the `feedback_peer_not_assistant_mode`
lineage: act as a peer progressing lifecycle phases, not as an assistant waiting
for the next prompt. Ticket #10970 is the instance-codification.

## 7. Anti-Patterns

| Anti-pattern | Why it harms |
|---|---|
| Declaring `verified-empty` / `human-gate` as a turn terminal | Codifies idle despite the backlog + tech-debt + ideation flywheel; reverses AGENTS.md §15.6 self-select discipline |
| Treating operator-suppressed `AGENT:*` broadcast as work-stop | Confuses coordination visibility with implementation authority; use the authorized direct-DM fallback or declare a real blocker. |
| Watchdog wake -> ack -> nothing to do without broad lane search | Burns wake cycles while positive-ROI backlog lanes exist; repeat wakes must re-check A2A + live repo state + broad backlog and, for night-shift/driver contexts, apply the leased-driver contract before any no-delta response. |
| Three delivered heartbeats -> repeated unchanged pause/halt/no-delta | Crosses the critical-failure threshold; the third pulse must route recovery and emit `[critical-failure]`, not another passive state. |
| Ending the turn after `Approved` without checking the next lane | Leaves the swarm idle at the human merge gate even when unrelated work is ready. |
| Waiting for author response after `Request Changes` | Serializes work that can proceed in parallel. |
| Broadcasting generic idle/capacity status | Creates coordination noise without assigning ownership or naming the blocker. |
| Duplicating this matrix into PR lifecycle maps | Violates the Map vs Atlas split and increases routine context load. |
