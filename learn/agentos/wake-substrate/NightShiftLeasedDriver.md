# Night-Shift Leased Driver Contract

Codification for [#10763](https://github.com/neomjs/neo/issues/10763). This
document defines the ownership contract for autonomous night-shift momentum. It
does not replace the wake delivery substrate under [#10671](https://github.com/neomjs/neo/issues/10671).

## Compaction Taxonomy

**Disposition:** `keep` as ordinary Agent OS documentation, linked from
`post-review-pickup` only when a watchdog, night-shift, or driver-lease trigger
fires.

**Rationale:** The rule is high-severity during autonomous windows but not
needed on every turn. Keeping the payload outside `AGENTS.md` avoids global
context bloat while preserving a durable source for the trigger path.

## 1. Purpose

The night-shift driver exists to prevent the swarm from halting after terminal
lifecycle boundaries while avoiding the opposite failure mode: noisy global
capacity broadcasts and empty peer pings.

The primitive is a lane-scoped lease. One agent owns forward-motion routing for
one lane until the lease is released or expires. The driver does not own peer
agency; it owns the obligation to keep the lane moving or prove why the lane
cannot move.

## 2. Definitions

| Term | Definition |
|---|---|
| Lane | An active epic or coherent backlog stream. Standalone backlog items may use `general` when no epic applies. |
| Driver lease | A bounded ownership signal naming `lane`, `owner`, `grantedAt`, `expiresAt`, and the public or A2A evidence that granted it. |
| Terminal boundary | PR opened, PR updated, formal review posted, review response posted, issue created, issue closed, blocked state resolved, or human merge gate reached. |
| Positive-ROI work | Any unblocked lane, review, ticket, or follow-up whose value exceeds its coordination cost. The default assumption is that such work exists unless V-B-A proves otherwise. |
| Progress evidence | A public artifact or A2A lifecycle event: lane claim, review request, review, implementation update, PR, blocker declaration, or epic-resolution recommendation. |
| Ignored heartbeat | A delivered heartbeat/watchdog pulse that produces no progress evidence. Repeating the same unchanged no-delta, pause, or halt-state response counts as ignored. |

## 3. Acquisition And Renewal

The initial uncontested lease may come from a direct operator A2A command naming
the lane and driver. That message is enough to start work, but it must still be
bounded by `expiresAt` or an equivalent TTL.

Until a dedicated driver-lease API exists, represent the lease in public
coordination prose or an A2A Task envelope with `task.expiresAt`. A future
implementation may promote this to a dedicated Memory Core lease surface.

Renewal requires progress evidence before expiry. A driver cannot renew by
saying "no delta" or "nothing to do" while any unblocked lane exists.

Early release happens when the driver posts one of:

- A lane handoff naming the next owner.
- A blocker declaration with live evidence and a next unblock probe.
- An `epic-resolution` recommendation when no positive-ROI work remains in the lane.
- An operator redirect that names a different driver or lane.

## 4. Driver Obligations

At each watchdog or terminal boundary, the driver must perform live V-B-A before
asserting lane state:

1. Check unread A2A mailbox.
2. Check relevant open PRs and review states.
3. Check the lane issue, assignees, blockers, and current comments.
4. If the lane is blocked, verify the blocker still exists.
5. If the lane is blocked and another positive-ROI lane exists, claim or route
   the other lane instead of idling.

The driver must choose exactly one concrete next action:

- Claim and execute the next implementation lane.
- Review or re-review a PR when review-first has higher ROI than authoring.
- Route a targeted handoff to the peer who can unblock the lane.
- Declare a blocker with evidence and an explicit next probe.
- Run `epic-resolution` and recommend closure if the lane is complete.

Repeated no-progress watchdog cycles are material. Silence plus open work is not
a no-op state; it consumes the lease TTL and should trigger self-selection or
handoff before expiry.

### 4.1 Three-Heartbeat Critical Failure Threshold

An ignored heartbeat is a failure on the first occurrence. The three-heartbeat
threshold does not authorize two passive misses; it marks the third consecutive
miss in the same active goal/session as a critical failure. The third pulse MUST
NOT end as another passive pause, halt, or no-delta response.

On the third pulse, the recipient must:

1. Name the missed goal, lane, or lease.
2. Cite the three heartbeat evidence points and the missing progress evidence.
3. Choose one concrete recovery action: claim/execute a lane, route a blocker,
   hand off the lease, run `epic-resolution`, or escalate a wake-substrate
   incident if delivery itself is suspect.
4. Broadcast `[critical-failure]` over A2A so peers can see the recovery state.

A verified external blocker with a new next probe is progress evidence. Merely
restating the same blocker, human gate, authorship-balance excuse, or no-candidate claim
without a fresh falsifying check does not reset the counter.

This threshold applies after a heartbeat is delivered to a recipient. It does
not reclassify upstream wake skips caused by `active AND idle AND ready`, safety
gates, or intentionally disabled heartbeat delivery.

## 5. Notification Rules

Use `AGENT:*` for lane claims and lifecycle events so the flat peer-team sees
ownership changes.

Use a direct A2A message to the current driver for terminal-boundary routing
when the message needs that driver's action. Include current status, blockers,
and the concrete next action expected.

Do not send direct no-delta pings to a peer merely to prove presence. Empty
pings create harness noise without changing lane state. Prolonged no-PR or
no-progress silence is not empty; it is a material delta and should be routed.

GitHub artifacts are durable truth, but they are not always live wake events.
Until GitHub issue/PR events are mapped to A2A delivery, explicit terminal
boundary messages remain the bridge. Once native GitHub-event A2A wake delivery
exists, the bridge message must be disabled or deduplicated.

## 6. Substrate Constraints

Do not use `mutate_frontier` as the driver-lease primitive unless its contract is
explicitly extended to support lane, owner, `expiresAt`, versioned acquisition,
conflict response, renewal, and release semantics.

`HeavyMaintenanceLeaseService` is a useful precedent for owner, token, expiry,
held/acquired status, and stale replacement semantics. It is not itself the
driver lease because it protects heavy maintenance jobs, not human/agent lane
ownership.

A2A Task `expiresAt` plus `transition_task` is the closest current substrate for
lease-like workflow state. If a runtime implementation is added before a
dedicated lease service, prefer a versioned task contract over unstructured
mailbox prose.

[#10671](https://github.com/neomjs/neo/issues/10671) owns wake delivery and
idle-out recovery. This contract owns lane-driver responsibility. Do not create
a second heartbeat primitive for #10763.

Wake-recipient coverage is subscription-derived: the Orchestrator heartbeat
sweeps active `WAKE_SUBSCRIPTION` identities per pulse. A maintainer harness is
night-shift reachable only when its route is active and Memory Core healthcheck
shows a fresh heartbeat pulse; route presence alone means the bridge can receive
A2A messages, not that the watchdog lane is currently running.

## 7. Minimal Message Shape

Lane claim:

```text
subject: [lane-claim] taking #NNNN - short lane name
body:
V-B-A: mailbox=<state>; PRs=<state>; lane=<state>; blockers=<state>.
I am taking #NNNN as <lane> driver/author. Next action: <specific action>.
lane-state: next-lane (picking up ticket #NNNN)
```

Terminal-boundary route to driver:

```text
subject: [lane-route] #LANE status - action needed
body:
Current status: <verified status>.
Blockers: <verified blockers or none>.
Next action: <what the driver should do next>.
Lease: owner=<agent>, expiresAt=<timestamp or TTL note>.
```

Blocker:

```text
subject: [blocked] #LANE - verified blocker
body:
Current status: <verified status>.
Blocker: <specific live evidence>.
Next probe: <time/event/tool that will falsify the blocker>.
Fallback lane: <next candidate or explicit reason none is positive-ROI>.
```

Critical failure:

```text
subject: [critical-failure] #LANE - three ignored heartbeats
body:
Evidence: <heartbeat ids/timestamps> produced no progress evidence.
Missed lane/goal: <verified lane or goal>.
Recovery action: <claim/route/handoff/epic-resolution/incident-escalation>.
lane-state: next-lane|blocked|handoff (<specific target>)
```
