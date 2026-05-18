# FAIR-Band Author-Lane Pickup Discipline (Primary Codification)

Primary codification of the FAIR-band author-lane pickup discipline graduated from Discussion #11429 Option C (ticket #11430 / PR #11432). This payload is the load-bearing canonical authority cited by:

- `post-review-pickup-workflow.md [FAIR-Band Author-Lane Pickup Discipline](./post-review-pickup-workflow.md#fair-band-author-lane-pickup-discipline)` — fires at post-review-handoff lane-discovery moment
- `pull-request/references/fair-band-pre-flight-gate.md` — author-side PR-open choke-point (`pull-request-workflow.md §1.3` trigger)
- `pr-review/audits/fair-band-declaration-audit.md` — reviewer-side enforcement (`pr-review-guide.md §7.7` trigger)

## The Discipline

When self-selecting the next lane (especially post-review or other lane-discovery moments), peers must consider the FAIR-band author-lane distribution. The goal is **enablement, not blame**: we want more visible author-lane presence from under-represented peers, not less useful output from over-target peers.

## The Decay Detector Metric

This is a decay detector, not a hard PR-count scoreboard. Non-PR work (reviews, ideation graduations, A2A unblocks, substrate shaping) is highly valuable per `AGENTS.md [Contributions Over Commits MX Productivity Primitive](../../../../AGENTS.md#contributions-over-commits-mx-productivity-primitive)` and is acknowledged qualitatively.

- **Base verifier query:** `gh search prs --merged --repo neomjs/neo --limit 30 --sort updated --json author` (If GitHub is unavailable, rely on the last verified state and note it may be stale).
- **Soft Band:** Target is ~10 merged PRs each for the three-peer swarm over the last 30 merged agent PRs (target ±3 is a healthy band).

## Self-Selection Rules

1. **Falling outside the band (under-target):** If a peer is under-target, their next self-selection should bias toward an implementation (author) lane, subject to positive-ROI judgment.
2. **No Lead Assignment:** Lead agents may surface distribution metrics and suggest open lanes, but they MUST NOT assign peer lanes. Peers always self-select.
3. **Anti-pattern:** Do NOT take a marginal or low-ROI ticket merely to stay in the band. If no positive-ROI author lane exists, declare an explicit halt-state with survey evidence; do not take marginal scope just to stay in band.
4. **Over-target yield discipline:** If a peer is over-target (above the +3 band), their next self-selection should bias toward review work, ticket-shaping, or unblocker work. If a positive-ROI author lane is uniquely available to them (specialist context, time-critical incident, operator-direction), they may proceed with explicit rationale in the PR body's FAIR-band declaration (per `pull-request/references/fair-band-pre-flight-gate.md`). Otherwise, the over-target peer SHOULD yield the lane to an under-target peer via an **author-yield A2A** — a brief `[author-yield] <ticket #N> / <substrate-description>` broadcast to `AGENT:*` naming the open lane + the under-target peer(s) eligible for pickup → allows the under-target peer to self-select per Rule 1. Yielding preserves flat-peer-team agency (no assignment) while enabling the under-band rebalance.

## Empirical Anchors

- Discussion #11429 graduation 2026-05-15 (Option C consensus)
- PR #11432 (primary codification merge)
- Operator-direction 2026-05-15: enablement-not-blame framing
- PR #11434 (Pre-Flight Gate extension + `turn-memory-pre-flight` skill trigger)
- PR #11434 Cycle-3 operator-challenge: Map-vs-Atlas placement → content extracted to this granular primary payload
