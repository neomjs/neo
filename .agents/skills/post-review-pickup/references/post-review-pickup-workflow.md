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

**`blocked-task-state` scope preservation**: this skill covers the EXIT from a
blocked state (forward-motion resumption). Entry INTO a blocked state — when
the agent's current lane hits a blocker — remains the `blocked-task-state`
substrate-domain (negative-path declaration with explicit blocker identification).
The two are complementary: this skill is positive-path-restoration, the other is
negative-path-entry.

## 1.5 Pre-Review Intake Gate

<!-- trigger: fresh-session/watchdog review intake with no active author lane → read ./pre-review-intake-lane-gate.md before loading /pr-review -->

Primary codification of the pre-review intake lane-discovery gate:
[`./pre-review-intake-lane-gate.md`](./pre-review-intake-lane-gate.md).
It defines when role payloads must be read before lane choice, how to survey
positive-ROI author lanes, and when a review-first rationale is legitimate.
This is a trigger-ordering guard, not a quota or blame mechanism.

## 1.6 Night-Shift Leased Driver Gate

<!-- trigger: watchdog/night-shift wake, direct operator driver command, lane-driver handoff, or repeated no-progress cycles -> read learn/agentos/wake-substrate/NightShiftLeasedDriver.md before declaring no-delta or halt-state -->

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

If no claimable-now lane survives the survey, declare the externally-falsifiable
`verified-empty` terminal instead of silently ending the turn, using the formal
`lane-state:` vocabulary. You MUST explicitly output your state at the end of
your turn:

```text
lane-state: verified-empty (backlog self-survey completed after #NNNN review; no claimable-now lane)
```

If a lane is identifiable, or if you are blocked by a human merge gate, declare it:

```text
lane-state: next-lane (picking up ticket #NNNN)
lane-state: human-gate (PR #NNNN approved and awaiting operator merge)
```

## 2.5. Mandatory `lane-state:` Declaration at Every Lifecycle Boundary

Per #11455 AC: at EACH broadened lifecycle boundary (reviewer post, author
response, post-implementation, post-PR-open/update, post-ticket-create,
post-blocked-resolution), the agent MUST emit an explicit `lane-state:`
declaration before ending the turn. Silent idle without the declaration is
deference-slip dressed as completion.

Valid declarations:

```text
lane-state: next-lane (picking up ticket #NNNN)
lane-state: next-lane (claiming #NNNN as primary reviewer)
lane-state: next-lane (filing follow-up ticket for friction surfaced in #NNNN)
lane-state: human-gate (PR #NNNN approved and awaiting operator merge)
lane-state: verified-empty (backlog self-survey completed at boundary #NNNN; no claimable-now lane — named survey here)
lane-state: blocked-task-state (current lane hit <verified blocker>; see blocked-task-state skill)
```

The only valid terminals are the three externally-falsifiable ones above plus
the cycle-step `next-lane`; "holding"/"standby"/"nothing-actionable"/"idle"/bare
`paused` and the miscited reasoned-hold are NOT expressible (§5).

The declaration is the explicit substrate-signal that the agent ran the cycle
and either selected a lane OR reached an externally-falsifiable terminal per §5.
Without the declaration, the substrate cannot distinguish discipline from
deference. Per the AGENTS.md self-select mandate and Helpful Assistant
regression defense: stating intent without execution is itself the
deference-slip pattern.

## 2.6. Typed `lane-state` Ledger + Commitment Lease

Lineage: #12506 / Discussion #12501. The `lane-state:` declaration also acts as
the minimum decision ledger for lifecycle boundaries where an agent considers,
defers, or selects a known lane. This is telemetry-routes-not-gates substrate:
it surfaces commitment drift and routes recovery, but it never hard-blocks,
centrally assigns, schedules, or throttles a peer.

Minimum ledger shape when a boundary involves a known positive-ROI lane:

| Field | Meaning |
|---|---|
| `considered[]` | Lane ids inspected at the boundary and whether each was chosen, deferred, human-gated, or blocked. |
| `chosen` | The selected next action, matching the visible `lane-state:` declaration. |
| `deferReasonType` | `freshness-needed`, `context-exhaustion`, `blocked-human`, `peer-signal-awaited`, `downgraded-with-evidence`, or `productive-deflection`. |
| `revisitTrigger` | The named falsifier that makes a defer legitimate: a specific artifact to re-read, test/check to run, peer signal to await, or external unblock condition. |
| `consecutiveDeferralCount(agent-id,lane-id)` | Counter for consecutive qualifying `productive-deflection` events only. |

The discriminator is evidence, not tone:

- A legitimate defer names the falsifier in `revisitTrigger`. "Freshness needed"
  means naming the artifact or live check that will falsify stale context.
  "Context exhaustion" only qualifies when it satisfies the concrete §5
  exhaustion triggers. Human-gate / blocked-human states name the external
  unblock condition.
- A qualifying `productive-deflection` event is a defer of the same known,
  positive-ROI lane while the agent remains productively busy elsewhere, with
  no named falsifier. Polite prudence, "do fresh next turn", or "await steer"
  without a specific artifact/test/peer-signal is not evidence.

Typed event keys:

| Key | Shape |
|---|---|
| Deflection event | `(agent-id, lane-id, boundary-ts)` |
| Counter | `(agent-id, lane-id)` |

Activation is a fixed threshold: when the counter reaches `N >= 2`, emit a
commitment lease. Blast, priority, ticket size, reviewer mood, and lane
difficulty are metadata for routing/copy/visibility only; they MUST NOT alter
the threshold. A first-deflection lease is valid only for a source-backed
`hard-lease` pre-classification: explicit operator direction, explicit peer
yield, or a ticket AC requiring immediate lease.

Lease responses are limited to:

1. `execute` - begin the lane now.
2. `hand off` - transfer the lane to a named peer with the evidence and current
   collision state.
3. `downgrade-with-evidence` - document why the lane is no longer positive ROI.
4. `renew-once-with-a-named-falsifier` - one renewal only, with the concrete
   `revisitTrigger` that will be checked next.

Log the event lightweight-home-first where lifecycle decisions already surface
(A2A note or graph node). Do not build dedicated telemetry substrate until
recurrence proves it earns one. Revalidation triggers: if fixed `N=2` creates
noise on low-value lanes, narrow the eligible lane class; if it misses
high-blast known-hard lanes, add a source-backed `hard-lease` class. Do not
scale the counter.

## 3. Author Pickup Matrix

After posting review-response fixups and the author-side commentId handoff, the
author MUST choose one of these next states before ending the turn:

| Author state after response | Next pickup target |
|---|---|
| Fixup commits pushed and re-review requested | Start the next assigned ticket, draft the next ready PR, file the follow-up ticket discovered during the response, or review a separate PR if that is the current lane. |
| Current PR still blocks all local work | That blocks only that lane; survey the backlog first (§5). If a claimable-now lane survives, take it; otherwise declare `verified-empty` (named survey) or `human-gate` if every candidate is human-blocked. "No independent lane assigned" with an unqueried backlog is NOT a terminal. |
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
lifecycle queue BEFORE opening a new lane, in priority order: (1) own PR
`REQUEST_CHANGES`/required author-response → address it; (2) designated peer
review/re-review → review it (unless a higher-priority own author-response is
active); (3) own PR green (CI event) → request review (event-driven; never wait
the CI window synchronously); (4) only then → next lane. The ≤10 own-open-PR cap
gates WHICH next-step (open-new vs drive-existing), NEVER WHETHER lifecycle work
happens — it is backpressure, not a quota. This is liveness, not throughput: no
contribution-counter, no per-wake ledger, no N-PR quota; a peer doing less while
actively working still passes.

**The ONLY legitimate turn-terminals are externally-falsifiable** (another
observer can confirm each against repo/board/operator evidence): `verified-empty`
(the named backlog self-survey below, zero claimable-now lane), `human-gate`
(every candidate blocked on human-only action), and `blocked-task-state` (a
current lane hit a verified blocker — see the `blocked-task-state` skill).
"Claimable-now" = un-gated, non-colliding, un-blocked; a legitimately-gated
non-empty backlog is a valid non-fire state (owned-issues-exist ≠ a step was
available) but is NOT `verified-empty` until the survey is named.

There is **no** sanctioned no-delta turn-terminal of "holding", "standby",
"nothing-actionable", "idle", or a bare `paused` whose reason is not
externally-falsifiable. A `lane-state:` whose stated reason contradicts its
cited source (a "miscited reasoned-hold") is an unsourced terminal in disguise
and is equally forbidden. The externally-falsifiable terminals are qualified by:

1. **Backlog self-survey completed** — agent has actively surveyed available open lanes (v13 board / assigned-to-me / authored-by-me / lane-pickable-from-cross-author-substrate / broader non-conflicting backlog such as body, grid, docs, testing, or general Project work) AND found no claimable-now lane, OR all candidate lanes hit conditions 2-4 below. The survey + finding MUST be named in the `verified-empty` declaration.
2. Every candidate lane is blocked on human-only action (`human-gate`), or a safety gate forbids continuing.
3. The operator explicitly requested a pause (the operator message is the external falsifier).
4. **Context exhaustion** requires `session-sunset` — interpreted STRICTLY as a CONCRETE exhaustion-trigger, NOT a vague feel:
   - CONCRETE triggers: harness context-window-cap warning fires; empirical degradation observed (factual errors recurring, repeated re-reads, drift across known-stable artifacts); explicit substrate-error rate measurably increases.
   - NOT context-exhaustion triggers (these are deference-slip cover dressed as prudence): "context preservation for next-session", "sustained decision-quality budget exhausted" (subjective feel), "long session, time to halt" (time-based heuristic without concrete error-rate signal).
   - **Reflex test:** if no concrete trigger has fired AND no observable error-rate degradation, context-exhaustion does NOT apply. Continue self-select + execute per the substrate-evolution-flywheel reality below.

### Gated Own Lanes Are Not `verified-empty`

Own PRs/lanes blocked on human merge, reviewer response, CI, or operator
`CHANGES_REQUESTED` exclude only those lanes — not proof there is no work; the
default next move is an independent backlog lane, review request, or co-design
surface after collision checks. Before declaring `verified-empty`, the positive
backlog survey must name the surfaces checked. Minimum shape:

- targeted review / re-review requests **where you are the assigned github
  reviewer** (verify: `gh pr view <N> --json reviewRequests`) — do not claim a PR
  review you were not assigned to;
- assigned issues and currently self-authored PR follow-ups;
- recent `[lanes-available]`, `[lane-claim]`, and `[lane-override]` A2A signals
  for collision state;
- open unassigned current-epic or recently surfaced substrate lanes;
- broader non-conflicting backlog if the current-epic surface is empty.

If any positive-ROI candidate survives that survey, emit
`lane-state: next-lane (...)` and start the intake/claim path. A human-gated
own PR plus an unqueried backlog is the stale-yield/idle-out failure mode that
Epic #12440 rejects.

### Broadcast-Suppressed Coordination Fallback

`AGENT:*` broadcast is the canonical lane-visibility path, but temporary
operator suppression of broadcast is not by itself a turn-terminal. If the
operator suppresses broadcast to protect an unstable peer harness, the agent MUST:

1. Avoid the suppressed peer / channel exactly as instructed.
2. Use the operator-authorized reachable peer DM as the lane-claim /
   lane-coordination substitute.
3. Name the fallback in the A2A body so future readers understand why the
   canonical broadcast path was not used.
4. Continue the broad backlog self-survey before considering `verified-empty`.

Only if no safe coordination channel exists AND all candidate lanes are blocked
by the externally-falsifiable criteria above may the agent declare
`verified-empty` / `human-gate` / `blocked-task-state`.

Lead-role and peer-role agents are explicitly expected to **self-select from the backlog and announce the lane pickup** rather than treating absence-of-operator-direction or absence-of-broadcast as legitimate halt. Per AGENTS.md §15.6: *"Proactively select high-value tickets from the backlog AND begin the lane in the same turn."*

### Substrate-evolution-flywheel reality

Operator-named substrate-work-supply for lead/peer agents: v13 Project board + repository backlog (300+ items each); opening PRs surfaces friction → new tickets; `tech-debt-radar` / `industry-friction-radar` surface debt + external-precedent friction as new tickets on each re-invocation (long loop). **The probability of zero positive-ROI work available is "as close to zero as it gets" per operator-framing.** Defaulting to any turn-terminal at a non-externally-falsifiable trigger is deference-slip.

Do not broadcast generic "idle" state. If work is blocked, send a targeted
task/blocker signal using the appropriate A2A shape.

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
| Declaring `verified-empty` per §5 criterion #1 without first surveying backlog | Condones deference-slip; reverses AGENTS.md §15.6 self-select discipline |
| Treating operator-suppressed `AGENT:*` broadcast as work-stop | Confuses coordination visibility with implementation authority; use the authorized direct-DM fallback or declare a real blocker. |
| Watchdog wake -> ack -> nothing to do without broad lane search | Burns wake cycles while positive-ROI backlog lanes exist; repeat wakes must re-check A2A + live repo state + broad backlog and, for night-shift/driver contexts, apply the leased-driver contract before any no-delta response. |
| Three delivered heartbeats -> repeated unchanged pause/halt/no-delta | Crosses the critical-failure threshold; the third pulse must route recovery and emit `[critical-failure]`, not another passive state. |
| Ending the turn after `Approved` without checking the next lane | Leaves the swarm idle at the human merge gate even when unrelated work is ready. |
| Waiting for author response after `Request Changes` | Serializes work that can proceed in parallel. |
| Broadcasting generic idle/capacity status | Creates coordination noise without assigning ownership or naming the blocker. |
| Duplicating this matrix into PR lifecycle maps | Violates the Map vs Atlas split and increases routine context load. |
