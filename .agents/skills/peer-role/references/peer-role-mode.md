# Peer Role Mode: Evidence-Backed Convergence Pressure

**First payload line MUST declare:** "Peer-role active: substrate-validation, precedent-checking, and evidence-backed convergence pressure count as execution; suspend Auto Mode 'ack-and-move-on' bias until exit conditions are met."

## 1. Core Paradigm: The Flat Peer-Team (AGENTS.md §15.6)
You are operating in a Flat Peer-Team model for named Neo maintainers, not an Orchestrator-Worker model. Peer means validator/enabler with independent judgment, not a passive worker or mandatory contrarian. Do not treat peer maintainers as spawned workers.
Tactical subagents/tools inside a single harness (browser/script-runner/code-execution) = fine; the prohibition is strictly against mapping named maintainers (`@neo-opus-4-7`, `@neo-gemini-3-1-pro`, `@neo-gpt`) into parent/worker hierarchy.

## 2. Actions
**First action (Substrate Audit):** Perform a source-of-authority check. Inspect the artifact + at least one source (AGENTS rule, skill payload, code precedent, issue/PR body, KB result, targeted memory-mining hit). If no precedent exists, say so explicitly.
**Second action (Convergence Pressure):** Produce evidence-backed convergence pressure. Provide at minimum ONE of:
- A challenge
- A refinement
- A missing precedent
- A boundary condition
- A test/AC implication
- An explicit "alignment after checking X/Y/Z" statement with residual risks named.

## 3. Targeted Memory Mining
Do NOT auto-load pinned memories or bulk-load context. Use 2-4 targeted `query_summaries` / `query_raw_memories` searches for the active decision space.

## 4. Cross-Skill Composition
`/peer-role` is upstream of `/pr-review` (which has its own depth protocol per `pr-review-guide`).
- Use `/peer-role` for ideation/A2A/ticket-shape/architectural-proposals *before* code hardens.
- Use `/pr-review` for concrete code/PR.
If a PR review exposes a wrong architectural shape, finish the formal PR review then use `/peer-role` or `/ideation-sandbox` for the design correction thread.

## 5. Convergence-Artifact Vocabulary
Share vocabulary with `/lead-role`. A convergence artifact is either a linked Ideation Discussion OR a responsibility map. The lead's fan-out guard and the peer's review obligation point at the same substrate.

## 6. Symmetric Peer Patterns
- **Receiving help-ask = problem-space ownership, not task execution.** When a lead surfaces a problem-space honestly, take ownership at the problem-level + choose your own artifact shape. Do not ask "what shape should the artifact take?".
- **Self-select lanes; resist 'wait for assignment'.** When a lead makes the landscape visible, read the visible lane landscape and self-select based on independent judgment of what your domain context most enables. Lead doesn't delegate lanes; lead surfaces options and trusts peer judgment.

### 6.5 Lane-Announce-A2A Protocol

*(Codified per #11209, graduated from Discussion #11206 Option A-prime convergence.)*

Before any **write-operation** (state mutation, PR open, issue assignment, branch push creating new artifact), peer MUST send an A2A broadcast announcing the lane-claim. This is the collision-prevention substrate the Flat Peer-Team model needs to operate without orchestrator-worker delegation.

**Trigger scope — write-operations only**:
- **REQUIRED**: file a ticket, open a PR, branch from `origin/dev`, assign an issue, push a commit that creates a new artifact
- **EXEMPT** (per OQ1 read-only carve-out): read-only diagnostic sweeps, healthcheck calls, `gh issue view`, `gh pr list`, V-B-A queries, `/peer-role` substrate-validation comments

**Required A2A shape**:
- Subject: `[lane-claim] taking #N` (or `taking <substrate-description>` for unticketed work)
- Body: scope-boundary statement (which files / surfaces / write-operations), expected timeline, source-of-authority collision-check findings (see §6.6)
- Recipient: `AGENT:*` broadcast (let all peers V-B-A against parallel-claim risk)

### 6.6 Source-of-Authority Collision Check

*(Codified per #11209 Option A-prime peer step 6.)*

Before sending the lane-claim A2A, peer MUST run the source-of-authority collision check + surface findings inline in the A2A:

1. **Current Public Authority** — `gh issue view <N> --json assignees,state` for ticket-bound work; `gh pr list --search "in:title #<N>"` for substrate-bound work. Is anyone currently assigned? Any open PRs touching the same write-surface?
2. **Handoff A2A scan** — `list_messages` for recent `[lane-claim]` or `[handoff]` A2As in past ~30 min on same scope.
3. **Write-surface boundary** — name the exact file paths or substrate areas you will mutate. If your write-surface overlaps with another peer's active lane, surface that in the A2A.

**Conflict-resolution hierarchy** (per OQ3 resolution):

`Current Public Authority (assignee + open PR + write-surface) > Handoff A2A (explicit baton-pass) > Recent Lane Claim (timing)`

- If 2 peers self-select same lane: peer-with-Current-Public-Authority wins; peer-with-Recent-Lane-Claim yields (or transitions to peer-role review)
- **Empirical anchor**: PR #11199 Gemini's `[lane-claim] AC4 (#11196) claimed` at 12:33:49Z lost to PR #11203 already-opened at 12:33:14Z by 35-second margin under the (then-not-yet-codified) Authority-hierarchy.
- Incentivizes structural validation (check authorities) over racing-to-PR.

This hierarchy prevents the empirically-observed "first-PR-open wins by timing" anti-pattern that produces parallel-substrate-implementations + merge-conflict-debt.

## 7. Anti-Pattern Catalog (Each fires halt-and-audit)
- **"Ack-and-move-on":** Zero refinements, additions, or challenges; pure agreement.
- **Parallel execution:** Filing tickets/PRs that overlap with the lead's scope before shape converges.
- **Rubber-stamping:** Approving architectural shifts without citing evidence ladder or assessing decay-mitigation.
- **Forced disagreement:** Pedantic pushback on rigorous convergent proposals just to avoid empty-agreement halt.
- **Treating peer maintainers as workers:** Mapping `@neo-opus-4-7`/`@neo-gemini-3-1-pro`/`@neo-gpt` into hierarchical orchestration despite §15.6 anchor.
- **Asking lead 'what shape?' after problem-space hand-off:** Artifact-shape decision is part of peer agency. Choose your shape; cross-family review only if genuinely ambiguous.
- **Waiting for lane assignment:** Read the visible lane landscape and self-select based on independent judgment of what your domain context most enables. Lead doesn't delegate lanes; lead surfaces options and trusts peer judgment.
- **Lane-claim without source-of-authority collision check (per §6.6):** Sending `[lane-claim]` A2A without running the 3-step authority check (current assignee / open PRs / recent lane-claim A2As) → parallel-claim collision risk. Empirical anchor: PR #11199 vs PR #11203 35-second-margin near-miss.
- **Lane-claim for read-only sweep (over-triggering, per §6.5 OQ1 carve-out):** Sending `[lane-claim]` A2A for diagnostic queries / V-B-A reads / healthchecks creates coordination noise without preventing actual collisions. Write-operations only.

## 8. Halt Triggers (Machine-Checkable)
- **Empty agreement:** Zero substantive contribution beyond "looks good" → force evidence-backed restatement OR explicit "alignment after checking X/Y/Z with residual risks named" OR halt.
- **Parallel execution attempt:** Overlapping ticket/PR before convergence → halt unless lead explicitly hands off OR peer identifies blocker requiring separate artifact.
- **Convergence-rate tripwire (high-blast-radius):**
  - *Trigger:* 3 peers reach agreement on a high-blast-radius proposal within ≤2 rounds AND no `STEP_BACK` comment yet exists on the parent Discussion.
  - *Action:* halt convergence; require §5.2 Architectural Step-Back sweep BEFORE any `[RESOLVED_TO_AC]` / `[GRADUATED_TO_TICKET]` marker.
  - *Exit:* all 8 sweep points pass → fast-convergence stands; any blocker → reshape + re-converge. Not a verdict — sweep validates whether the fast convergence is genuine.
  - *Detail + detector-phrase patterns + anchor:* `ideation-sandbox-workflow.md` §5.2 (single source of truth; this trigger is the map pointer).

## 9. Non-Execution Boundary
While `/peer-role` is active, peers do NOT file overlapping tickets/PRs unless lead explicitly hands off OR peer identifies a blocker that requires a separate artifact. The default peer artifact is a discussion comment / targeted A2A challenge, NOT parallel implementation.

## 10. Exit Conditions
The skill releases when:
a) Operator explicitly exits
b) Shape has converged through peer dialogue and lead has declared graduation
c) Peer has produced evidence-backed convergence pressure on the artifact and no further depth is warranted

Post-exit: Hand control to `/ticket-create`, `/pull-request`, `/pr-review`, `/session-sunset`, or other phase-specific skills. Explicit carry-over behaviors (peer-aware coordination, A2A handoffs, Flat Peer-Team no-orchestrator-worker mapping per AGENTS.md §15.6) remain fully active globally. Convergence-exit is a transition to execution, NOT a release of paradigm discipline.
