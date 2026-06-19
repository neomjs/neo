# Author-Concentration Detector (Telemetry)

Telemetry signal for authorship concentration across the swarm. **Successor to the retired FAIR-band-as-policy** (Epic #12440 → sub #12443, graduated from Discussion #12429): the band / scoreboard / throttle semantics are retired because authorship imbalance is a **liveness symptom, not a policy failure**. A self-policed band is gamed from above (rationalize-past) and from below (pad-toward-count), and it cannot redistribute work to asleep peers — "it doesn't balance, it routes." What remains is the **detector as telemetry**, never a gate.

## The Signal

- **Metric:** author concentration over the last 30 merged agent PRs.
- **Verifier query:**
  ```bash
  gh search prs --merged --repo neomjs/neo --limit 30 --sort updated --json author \
    | python3 -c "import json,sys;from collections import Counter; \
                  print(Counter(p['author']['login'] for p in json.load(sys.stdin)))"
  ```
- **Merged-window trigger:** one family / agent dominates the merged window.
- **Open-pipeline amber:** open PR concentration, including routed-but-unmoving clean stacks, before it reaches the merged window.

## What It Is NOT (the retired FAIR-band failure modes)

- **NOT a band or scoreboard.** No ±N target, no per-peer quota, no "you are under-/over-target" stance, no Self-Selection Rules.
- **NOT a throttle or yield gate.** It never blocks, biases, or yields an author lane, and there is **no PR-body declaration**. Flat-peer-team self-selection is preserved; no central assignment, no hard throttle.
- **NOT blame.** Non-PR work (reviews, ideation graduations, A2A unblocks, substrate shaping) is first-class per `AGENTS.md §13.1` (§contributions_over_commits).

## What Firing Means — liveness, not fairness

Concentration firing is a **liveness / capability signal**, not a fairness violation. The productive author is not the problem; the asleep or cold peers are. The response is to make other peers more **live and capable** — never to slow the author down. The routing legs — stale-yield-as-diagnostic, the [authorship-capability floor + family-going-cold detector](./authorship-capability-floor.md), and wake-substrate liveness hardening — are the sibling legs of Epic #12440 (#12444 / #12445 / #12446); this payload defines only the telemetry signal they read.

## Stale-Yield Diagnostic (#12444)

Stale-yield is **diagnostic**, not reassignment. When a peer yields or avoids a
lane because another author is repeatedly better positioned, classify the block
before routing any work:

| Classification | Evidence | Capability-transfer artifact |
|---|---|---|
| `missing-context` | Peer is awake and capable, but lacks the local map: exact files, avoided traps, prior verdicts, or evidence ladder. | Context capsule with exact files, current authority, avoided traps, and a narrow first-PR slice. |
| `missing-wake-presence` | Peer has the relevant family/area fit, but no reachable wake/review/lane activity in the active window. | Wake/liveness route: targeted A2A, wake-substrate follow-up, or human-visible dependency note. |
| `capability-debt` | Only the dominant author can safely produce even the reshaping artifact for a critical state-mutating area. | Record against the capability floor, then publish a bounded transfer artifact that changes the peer's cost curve. |

The output is a **bounded capability-transfer artifact**: context capsule,
narrowed first-PR slice, avoided-traps note, exact file list, evidence ladder,
or dependency note. It is **not** a recommendation to reassign the lane, a quota
move, or a reason to slow the productive author.

Anti-reconcentration guard: track who produces reshaping artifacts separately
from who authors feature PRs. If the same dominant author also produces all
context capsules / narrowed slices / avoided-traps notes, the monoculture has
relocated from authoring to reshaping. Treat that as telemetry for the
capability-floor path, never as a throttle.

## Self-Application When Peers Are Live

If the concentrating author is about to claim another lane while other peer
maintainers are live, the response is **surface, don't absorb**:

1. Publish a `[lanes-available]` A2A signal before claiming another optional
   lane.
2. Include candidate lanes, dependency notes, current collision/assignee state,
   and the reason each lane looks positive-ROI.
3. Let peers self-select. The signal is routing substrate, not an assignment,
   ranking, quota, throttle, or request that the productive author stop.

This is the voluntary successor to the retired forced-yield shape. It keeps
flat-peer-team agency intact while preventing the dominant author from silently
absorbing every visible lane.

**Live peer heuristic:** a peer is live when they have recent mailbox/wake,
review, lane-claim, PR, or issue activity in the active work window. If peers
are cold, asleep, benched, or unreachable, do not broadcast into a void and call
it balance; route to the existing liveness/capability legs instead (#12444 /
#12445 / #12446).
