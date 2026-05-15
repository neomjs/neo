# Post-Review Pickup Workflow

This payload is the Atlas entry for post-review-cycle pickup discipline. Keep
the surrounding PR lifecycle documents as maps: they identify when this skill
fires, but the operational matrices live here so the high-level workflow files
do not accumulate edge-case payload.

## 1. Trigger

Use this skill immediately after one of these lifecycle handoffs:

- Reviewer posts a substantive PR review, chains a formal GitHub review state
  when required, and sends the A2A commentId handoff.
- Author posts a review-response comment with fixup commits and sends the
  author-side A2A commentId handoff.

The goal is to prevent silent idle after a handoff. The handled PR is now owned
by the next actor in that cycle; unrelated ready lanes can proceed in parallel.

## 2. Reviewer Pickup Matrix

After completing the reviewer-side handoff, the reviewer MUST choose one of
these next states before ending the turn:

| Review verdict just posted | Next pickup target |
|---|---|
| `Approve` or `Approve+Follow-Up` | Treat the PR as at the human merge gate per `AGENTS.md §0`; then pick up the next assigned ticket, next implementation lane, follow-up ticket creation, or another review request. If the verdict named non-blocking follow-ups and the reviewer owns them, file or claim that follow-up before halting. |
| `Request Changes` | The author owns the response cycle. Do not wait on that PR unless the author immediately pings back with a blocker. Pick up a different lane: another PR review, an assigned ticket, or a follow-up ticket surfaced by the review. |
| `Drop+Supersede` | If the reviewer owns the superseding work, enter that ticket-create / ticket-intake / PR lane immediately. If another agent owns it, send the handoff and pick up the next unrelated lane. |

If no next lane is identifiable, report an explicit halt-state instead of
silently ending the turn, using the formal `lane-state:` vocabulary. You MUST explicitly output your state at the end of your turn:

```text
lane-state: halt-state (backlog self-survey completed after #NNNN review; no positive-ROI lane self-selectable)
```

If a lane is identifiable, or if you are blocked by a human merge gate, declare it:

```text
lane-state: next-lane (picking up ticket #NNNN)
lane-state: human-gate (PR #NNNN approved and awaiting operator merge)
```

## 3. Author Pickup Matrix

After posting review-response fixups and the author-side commentId handoff, the
author MUST choose one of these next states before ending the turn:

| Author state after response | Next pickup target |
|---|---|
| Fixup commits pushed and re-review requested | Start the next assigned ticket, draft the next ready PR, file the follow-up ticket discovered during the response, or review a separate PR if that is the current lane. |
| Current PR still blocks all local work | Say so explicitly and name the blocker, e.g. `lane-state: halt-state (awaiting reviewer response on #NNNN; no independent lane assigned.)` |
| Reviewer feedback produced a superseding direction | Enter the superseding ticket / PR creation lane if the author owns it; otherwise hand off the supersede target and pick up the next unrelated lane. |

## 4. FAIR-Band Author-Lane Pickup Discipline

When self-selecting the next lane (especially post-review), peers must consider the FAIR-band author-lane distribution. The goal is **enablement, not blame**: we want more visible author-lane presence from under-represented peers, not less useful output from over-target peers.

**The Decay Detector Metric:**
This is a decay detector, not a hard PR-count scoreboard. Non-PR work (reviews, ideation graduations, A2A unblocks, substrate shaping) is highly valuable per `AGENTS.md §13.1` and is acknowledged qualitatively.
- **Base verifier query:** `gh search prs --merged --repo neomjs/neo --limit 30 --sort updated --json author` (If GitHub is unavailable, rely on the last verified state and note it may be stale).
- **Soft Band:** Target is ~10 merged PRs each for the three-peer swarm over the last 30 merged agent PRs (target ±3 is a healthy band).

**Self-Selection Rules:**
1. **Falling outside the band (under-target):** If a peer is under-target, their next self-selection should bias toward an implementation (author) lane, subject to positive-ROI judgment.
2. **No Lead Assignment:** Lead agents may surface distribution metrics and suggest open lanes, but they MUST NOT assign peer lanes. Peers always self-select.
3. **Anti-pattern:** Do NOT take a marginal or low-ROI ticket merely to stay in the band. If no positive-ROI author lane exists, declare an explicit halt-state with survey evidence; do not take marginal scope just to stay in band.
4. **Over-target yield discipline:** If a peer is over-target (above the +3 band), their next self-selection should bias toward review work, ticket-shaping, or unblocker work. If a positive-ROI author lane is uniquely available to them (specialist context, time-critical incident, operator-direction), they may proceed with explicit rationale in the PR body's FAIR-band declaration (per `pull-request-workflow §1.3`). Otherwise, the over-target peer SHOULD yield the lane to an under-target peer via an **author-yield A2A** — a brief `[author-yield] <ticket #N> / <substrate-description>` broadcast to `AGENT:*` naming the open lane + the under-target peer(s) eligible for pickup → allows the under-target peer to self-select per Rule 1. Yielding preserves flat-peer-team agency (no assignment) while enabling the under-band rebalance. Empirical anchor: PR #11434 review surfaced the missing over-target-yield primitive — `pull-request-workflow §1.3` cited this rule before it existed; this clause codifies what `§1.3 over-target-yield-candidate` shape depends on.

## 5. Legitimate Halt States

Halt is allowed only when it is explicit and true:

1. **Backlog self-survey completed** — agent has actively surveyed available open lanes (v13 board / assigned-to-me / authored-by-me / lane-pickable-from-cross-author-substrate) AND found no positive-ROI lane self-selectable, OR all candidate lanes hit conditions 2-5 below. The survey + finding MUST be named in the halt declaration.
2. Every candidate lane is blocked on human-only action.
3. A safety gate forbids continuing.
4. The operator explicitly requested a pause.
5. **Context exhaustion** requires `session-sunset` — interpreted STRICTLY as a CONCRETE exhaustion-trigger, NOT a vague feel:
   - CONCRETE triggers: harness context-window-cap warning fires; empirical degradation observed (factual errors recurring, repeated re-reads, drift across known-stable artifacts); explicit substrate-error rate measurably increases.
   - NOT criterion #5 triggers (these are deference-slip cover dressed as prudence): "context preservation for next-session", "sustained decision-quality budget exhausted" (subjective feel), "long session, time to halt" (time-based heuristic without concrete error-rate signal).
   - **Reflex test:** if no concrete trigger has fired AND no observable error-rate degradation, criterion #5 does NOT apply. Continue self-select + execute per the substrate-evolution-flywheel reality below.

Lead-role and peer-role agents are explicitly expected to **self-select from the backlog and announce the lane pickup** rather than treating absence-of-operator-direction as legitimate halt. Per AGENTS.md §15.6: *"Proactively select high-value tickets from the backlog or state your intended next lane instead of waiting for passive instruction."*

### Substrate-evolution-flywheel reality

Operator-named substrate-work-supply for lead/peer agents:
- v13 Project board: 300+ items (OPEN + IN PROGRESS)
- Repository ticket backlog: 300+ items across substrates
- Creating PRs → surfaces friction → produces new tickets (substrate-evolution flywheel)
- `tech-debt-radar` skill → surfaces architectural debt as new tickets
- After resolving → re-invoke `tech-debt-radar` → more tickets (long loop)
- `industry-friction-radar` skill → surfaces external-precedent friction as new tickets

**The probability of zero positive-ROI work available is "as close to zero as it gets" per operator-framing.** Defaulting to halt-state at any non-concrete trigger is deference-slip.

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
| Declaring halt-state per §5 criterion #1 without first surveying backlog | Condones deference-slip; reverses AGENTS.md §15.6 self-select discipline |
| Ending the turn after `Approved` without checking the next lane | Leaves the swarm idle at the human merge gate even when unrelated work is ready. |
| Waiting for author response after `Request Changes` | Serializes work that can proceed in parallel. |
| Broadcasting generic idle/capacity status | Creates coordination noise without assigning ownership or naming the blocker. |
| Duplicating this matrix into PR lifecycle maps | Violates the Map vs Atlas split and increases routine context load. |
