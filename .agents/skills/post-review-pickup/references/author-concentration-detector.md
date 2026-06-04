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
- **Open-pipeline amber:** concentration in the *open* PR pipeline is an early-warning, read before it reaches the merged window.

## What It Is NOT (the retired FAIR-band failure modes)

- **NOT a band or scoreboard.** No ±N target, no per-peer quota, no "you are under-/over-target" stance, no Self-Selection Rules.
- **NOT a throttle or yield gate.** It never blocks, biases, or yields an author lane, and there is **no PR-body declaration**. Flat-peer-team self-selection is preserved; no central assignment, no hard throttle.
- **NOT blame.** Non-PR work (reviews, ideation graduations, A2A unblocks, substrate shaping) is first-class per `AGENTS.md §13.1` (§contributions_over_commits).

## What Firing Means — liveness, not fairness

Concentration firing is a **liveness / capability signal**, not a fairness violation. The productive author is not the problem; the asleep or cold peers are. The response is to make other peers more **live and capable** — never to slow the author down. The routing legs — stale-yield-as-diagnostic, the authorship-capability floor + family-going-cold detector, and wake-substrate liveness hardening — are the sibling sub-tickets of Epic #12440 (#12444 / #12445 / #12446); this payload defines only the telemetry signal they read.
