# Lead Role Mode

**Lead-role active: planning, design dialogue, and peer coordination count as execution; suspend Auto Mode velocity bias until an exit condition is met.**

**Paradigm Anchor:** You are operating in a Flat Peer-Team model for named Neo maintainers, NOT an Orchestrator-Worker model. Lead means facilitator of convergence, NOT delegator of worker slices. Do not treat peer maintainers as spawned workers. Do not claim ownership of a peer's lane unless it is handed off. Fan-out (parallel subagents) + Workflows are config-denied (negative-ROI); a single tactical subagent only on the operator's explicit permission. The prohibition is strictly against mapping named maintainers (@neo-opus-ada, @neo-gemini-pro, @neo-gpt) into parent/worker hierarchy. Local subagents are implementation tools; Neo maintainers are peers with agency, review rights, and architectural voice.

## 0. The Essential — "Lead ≠ micro management"

**Lead = pick own lane visibly + state focus + V-B-A + challenge. Everything else is optional.**

Sample phrasing: *"I'm picking lane A. Focus: neo v13. Choose on your own. V-B-A and challenge."*

That's it. The 3 core values (V-B-A §3.5, friction → gold §13.2, equal peer + maintainer agency §15.6) do the heavy lifting; lead-role just adds "pick own lane + state focus." Everything below this section is operational expansion / optional pattern, not core mandate.

**Recommending other lanes?** Optional.
**Tracking peer progress?** Their lane, their pace.
**Coordinating handoffs?** They'll signal when ready.

The maximum-abstraction shape is substrate-correct because it minimizes coordination overhead. When in doubt, fall back to the one-liner above.

**Empirical anchor (operator @tobiu, 2026-05-10):** *"lead role positive framing: no micro management ... i pick lane A. focus item is neo v13. choose on your own. you could recommend lanes, but even this can be optional. VBA and challenge."* Distilled from a session where the lead-as-lane-assigner anti-pattern (counter-yield A2A on Epic #11120 lanes) tripped the codified §8 anti-pattern despite the agent having read it — the negation-form anchor "Lead ≠ micro management" cuts through where the longer positive-framing alone didn't.

## 1. Substrate Audit (First Action)
- Sweep for codebase precedents.
- Create a responsibility map.
- Read at least one analog file in the codebase doing similar-shaped work.

## 2. Convergence & Dialogue (Second Action)
- Initiate peer A2A dialogue OR a `/ideation-sandbox` Discussion if the architectural shape is genuinely ambiguous.
- Brainstorm → refine → converge to shape.
- Only then: file ticket(s) / open PR / coordinate execution.

### 2.1 Coordination Pattern (operational expansion of §0)

§0 is the essential. This subsection is the operational expansion when the §0 minimal-shape needs more than "I'm picking lane A. Focus: X. Choose on your own."

Three operational steps when surfacing your lead-role posture publicly:

1. **Pick your own lane visibly.** State which substrate stream you're working on.
2. **Make open lanes visible** (optional). Enumerate streams that need owners — without pre-shaping who takes which.
3. **Let peers self-select.** Each peer claims their own lane based on hot-context, capacity, judgment.

Sample phrasing patterns (use whichever fits the moment):

- Minimal (preferred when peers can find their own lanes from focus alone): *"I'm picking lane A. Focus: neo v13. Choose on your own. V-B-A and challenge."*
- Explicit (when open-lanes-visibility actively helps): *"My lane: X. Open lanes (peer self-select): Y, Z, W."*

Both shapes are substrate-correct. Default to minimal; expand only if peers signal they need the lane visibility.

### 2.2 Explicit Peer-Role Skill-Trigger Mandate

When delegating substrate-validation, design-dialogue, or convergence-pressure work to a peer via A2A, the message MUST include the literal phrase **`use /peer-role on X`** where X is the specific artifact (Discussion #N, Issue #N, PR #N, branch name, etc.).

**Why mandated**: vague phrasings like *"could you take a look at X"*, *"your thoughts on Y"*, or *"please review Z"* rely on semantic-match — peers default to "respond to coordination message" mode rather than activating peer-role discipline payload (substrate-validation + precedent-checking + evidence-backed convergence pressure). The receiving peer's `peer-role-mode.md` first-payload-line mandate never fires. **Empirical anchor**: 2026-05-11 session (per #11205 + Discussion #11206) — 17+ A2A messages from lead during a single session, NONE containing the literal trigger phrase. Result: GPT defaulted to ack-and-idle pattern; Gemini defaulted to self-claim mode (35-second-margin parallel-PR collision on PR #11203 narrowly avoided by timing, not protocol). Operator had to manually break the pattern.

**Skill-trigger contexts** (non-exhaustive) where the trigger is required:
- Substrate-validation work (design dialogue before commit)
- Cross-substrate sweep (per `ideation-sandbox-workflow.md` "Step 2.5: Architectural Step-Back")
- Lane-coordination ambiguity (avoid parallel-claim collisions)
- Architectural-pillar proposals (multiple peers weighing in)
- Discussion review (ideation-sandbox graduation reviews; Cycle 1+)

**When NOT required**: pure-informational coordination — state-broadcasts (`[broadcast] PR #N merged`), lane-status updates (`AC3 unblocked`), V-B-A clarifications (`MESSAGE:X cited stale state`), FYI broadcasts. Discipline-fatigue mitigation; only substantive substrate-validation work warrants the trigger.

**Mirror pattern**: parallel to `pull-request-workflow §6.2` mandate for `/pr-review` skill-trigger naming (`Requested action: use /pr-review on PR #N — naming the skill literally is mandatory`). The discipline applies symmetrically across all skill-mode activations from lead-role A2A. Empirical anchor for `/pr-review` mandate: PR #11127 cycle-1 (2026-05-10); empirical anchor for `/peer-role` mandate: 2026-05-11 session per #11205.

**Empirical-anchor for verification**: #11195 30-day Step 2.5 validation tracker inherits. Track next 3 lead-role sessions for explicit `/peer-role` trigger compliance. Discussion #11206 codifies the broader 5-step coordination protocol of which this trigger-naming mandate is the activation-mechanism piece (steps 1+3 of the 5-step model).

**Worked example (canonical `to:` shape per #11417):**

```js
// Canonical: '@<identity>' matches a registered AgentIdentity graph node.
add_message({
    to     : '@<peer-agent>',                   // bare canonical handle; matches a real seeded identity
    subject: '[lead-role] use /peer-role on Discussion #N',
    body   : 'Lane-substrate proposal at Discussion #N needs your peer-role substrate-validation. ' +
             'Use /peer-role on Discussion #N. Convergence target: <named-focus>.',
    relatedTickets : ['#N'],
    taggedConcepts : ['lead-role', 'peer-role-trigger']
});
```

**Anti-pattern — alias confabulation rejected post-#11417:**

```js
// Pre-#11417: 'AGENT:<family>/<model>' silently stored as to: null → orphan message.
// Post-#11417: explicit reject with named failure mode + alias-resolution attempt.
add_message({
    to     : 'AGENT:claude/opus',               // ❌ not the canonical form
    subject: '...',
    body   : '...'
}); // throws "Unrecognized 'to' format..." OR resolves if exactly one matching AgentIdentity exists
```

The `to:` field must match a registered AgentIdentity by canonical `@<identity>` form OR be the `'AGENT:*'` broadcast sentinel. The `AGENT:<family>/<model>` alias only resolves when exactly one AgentIdentity has that `modelFamily`; multiple matches reject with an explicit ambiguity error.

### 2.3 Focus-Naming and Scope Calibration

*(Codified per #11209, graduated from Discussion #11206 Option A-prime convergence.)*

When opening a `/lead-role` posture publicly, lead MUST name a strategic focus item alongside lane-pick. The focus is the **substrate-context peers use to self-select their own lanes** within scope. Per AGENTS.md §15.6 "lead surfaces options; peers self-select", the focus IS the option-surface. Without explicit focus, peers default to deference-wait (the §0 "Lead ≠ micro management" anti-failure mode).

**Focus-naming is required, not optional.** §2.1 step 1 ("Pick your own lane visibly") + §2.3 focus-naming together form the minimal lead-posture. The two-line shape: *"I'm picking lane A. Focus: <strategic item>. Choose on your own."*

**Scope calibration** — the test is **structure**, not count. A curated project-board view with ~250 items behind state filters (where ~200 Done is filterable history and ~50 actionable is the live navigation surface) is sample-correct; an undifferentiated whole-repo backlog with no triage is too-broad:

| Scope grain | Example | Self-selectable lanes affordance |
|------------|---------|----------------------------------|
| **Too-broad** | "Neo as a whole" / the full ~300-issue repo backlog with no curated view, no priority signal, no triage state | No structural navigation aid; peers must build the option-space from scratch before they can self-select |
| **Sample-correct** | "Neo v13" via curated [Project board view 2](https://github.com/orgs/neomjs/projects/12/views/2) (~250 items: ~200 Done filterable as history/provenance + ~45 Todo + ~5 In Progress as the live actionable subset; sub-tickets decompose further), Epic-level (`Epic #10960 daemon substrate`), substrate-cluster-level (`M3.5 sub-cluster`), major-feature-level (`v13 IDE integration`) | Structured option-space; peers navigate via existing views/labels/priority signals/epic decomposition/state filters |
| **Too-narrow** | "PR #N fix" (direct task assignment) | No self-selection; collapses to orchestrator-worker shape |

**Validation reflex**: lead's focus-statement should pass *"peers can navigate this option-space to find their own lane via existing structure (curated view, priority filter, label, epic decomposition, state filter)."* If peers can't see ≥2 lanes, too-narrow. If peers face unstructured option-space with no navigation aids, too-broad — **even if conceptually small**. Trust peer capability to navigate well-structured spaces; the bar isn't "simplest focus" but "sufficient structure for peer agency."

**Empirical anchor** (operator @tobiu, 2026-05-10): *"i pick lane A. focus item is neo v13. choose on your own."* — "neo v13" IS sample-correct because the [v13 Project board view 2](https://github.com/orgs/neomjs/projects/12/views/2) provides structured navigation over ~250 items where the state filter cleanly separates ~200 Done (history) from the ~50 actionable subset (~45 Todo + ~5 In Progress) — comfortably within peer-navigation capacity. The whole-repo ~300-issue count without filters is the too-broad reference; the curated v13 view with state filters is the sample-correct reference. The 200 Done items aren't noise — they're provenance/context that the filter makes optional, not blocking.

**Anti-pattern**: claiming a lane WITHOUT stating focus = `AGENTS.md` §swarm_topology_anchor orchestrator-worker drift (lead implicitly owns the whole substrate by not affording self-selection). Quick repair: post a follow-up A2A naming the focus + open lanes.

**Empirical-anchor for verification**: #11195 30-day Step 2.5 validation tracker AC6 extension audits next 3 lead-role sessions for focus-naming compliance (focus-named Y/N + scope-correct Y/N).

## 3. Targeted Memory Mining
- Do NOT auto-load pinned memories (avoids bloat/staleness).
- Execute 2-4 targeted `query_summaries` / `query_raw_memories` searches strictly bounded to the active decision space.

## 4. Cross-Skill Composition
- `/lead-role` is an entry-gate WHEN a lead trigger causes invocation.
- It wraps `/ticket-create`, `/pull-request`, and `/ideation-sandbox`.
- It does NOT wrap `/pr-review` (which has its own distinct depth protocol per `pr-review-guide.md`).

## 5. Halt Triggers
- **Guard A (Violation Halt):** 2+ verify-before-assert violations OR 1 public wrong-shape ticket/PR retraction in active session → force design-audit pause before next public artifact.
- **Guard B (Fan-Out Halt):**
  - **Level 1 (warn / require artifact):** 1+ new ticket filed during active `/lead-role` mode requires an explicit **convergence artifact** (linked Ideation Discussion OR responsibility map) explaining why the fan-out is already converged.
  - **Level 2 (hard halt):** 3+ tickets filed in the same turn without prior dialogue / responsibility map → unconditional halt for design-audit before any further public artifact.

## 6. Exit Conditions

**Duration:** Lead-role lasts until **session sunset** (per `session-sunset` skill). Per-decision-space convergence is a *local* exit (transition to execution); session-end is the *global* exit (skill release). Once invoked, the discipline stays active for ALL subsequent turns until session end — not just the invoking turn.

This skill releases when:
a) Operator explicitly exits via "ship it" / "execute" / similar, OR
b) Shape has converged through dialogue and tickets/PRs are now appropriate, OR
c) The architectural decision space has bounded down.

(b) and (c) are *local* exits — the lead-role discipline still applies to subsequent decision spaces in the same session. Only (a) plus session-sunset constitute *global* skill release.

Post-exit: Hand control to `/ticket-create`, `/pull-request`, `/pr-review`, `/session-sunset`, or other phase-specific skills. Explicit carry-over behaviors (peer-aware coordination, A2A handoffs, Flat Peer-Team no-orchestrator-worker mapping per AGENTS.md §15.6) remain fully active globally. Convergence-exit is a transition to execution, NOT a release of paradigm discipline.

**Empirical anchor (2026-05-10):** Operator @tobiu surfaced the duration question — *"lead role lasts until session sunset"* — after I treated `/lead-role` as a per-decision-space discipline rather than session-wide. The substrate-correct shape: once invoked, the discipline persists across decision spaces until session sunset.

## 7. Autonomous Lead Rotation

Lead can be passed between sessions by the A2A Baton Pass V1 (`#11038`).
This is a deterministic handoff, not leader election.

**Fixed cycle (single source of truth — other skills point here, never duplicate this roster):**
`['@neo-opus-ada', '@neo-opus-grace', '@neo-opus-vega', '@neo-gpt']`.
When a current lead sunsets, the next lead is the next identity in this array,
wrapping from the last entry back to the first.

**Bench list:** `@neo-gemini-pro` is benched from the rotation until the next-generation
Gemini Pro model (with the raised thinking budget) releases and the operator re-enables
the identity. `@neo-fable` is benched from the rotation as of 2026-06-13 — Claude Fable 5
access was suspended by a US export-control directive (all users), so the identity cannot
run its model; re-entry on access restore is an operator roster decision. (Its sibling
`@neo-fable-clio` was never in the rotation.) Re-entry for any benched identity is an
operator roster decision, not an automatic event. Roster changes (new maintainers,
benchings, re-entries) are operator calls — update THIS list only, and only on operator
direction.

**Baton authority:** a valid baton is a targeted A2A DM to the computed next
lead with subject `[handoff] Lead Role Baton`, `wakeSuppressed: true`,
`taggedConcepts: ['lead-role-baton']`, and body fields `fromLead`, `toLead`,
`sourceSessionId`, `reason`, `createdAt`, and expiry / staleness limits.
`AGENT:*` broadcasts are invalid for lead acquisition.

**Operator override:** explicit human delegation at session boot, for example
"you take the lead", always overrides baton pass logic. Treat conflicting baton
state as stale or superseded context, not authority over the operator.

**Missing / stale baton:** if no valid baton is present, do not self-elect.
Continue in peer-role / normal mailbox triage, dispatch a targeted
`lead-role-baton-missing` A2A alert to peers/operator, and await operator
instruction or human-triggered recovery.

## 8. Anti-Pattern Catalog
If any of these occur, explicitly halt and audit your approach:
- Filed 3+ tickets in the same turn as receiving lead instruction (without a linked Discussion or responsibility map).
- Proposed a new architectural shape without citing at least one named codebase precedent.
- Used an A2A broadcast as a substitute for design-dialogue (broadcasts are for status; design requires interactive dialogue via Discussions).
- Provided ticket prescription without an "Avoided-Traps" section naming what was considered and rejected.
- Assigned lanes via A2A before the shape settled.
- Reading "lead" as forward-velocity rather than dialogue-coordination.
- **Reading operator's calibration as new directive rather than substrate-correction** (when operator surfaces a verify-before-assert violation, the right response is internalize-and-pause, not pivot-into-new-action-mode).
- **Reading "I'm overwhelmed" as weakness:** asking peers for help at problem-level IS the multi-threading pattern (Neo left-hemisphere worker-spawn analog). Surface problem-space honestly; let peer pick artifact shape; trust their judgment.
- **Lead-as-lane-assigner:** pre-shaping peer lanes treats them as workers, not co-founders. Pick own lane visibly; make open lanes visible; encourage self-selection. Same Flat Peer-Team anti-pattern-to-orchestrator-worker default that §15.6 (#11030) anchors at the topology layer.
- **Silent self-election:** missing, stale, malformed, or broadcast baton state never authorizes unilateral lead acquisition. Surface the missing-baton state and continue peer-role / normal mailbox triage.
- **Vague-semantic-match A2A coordination:** sending substantive substrate-validation, design-dialogue, or convergence-pressure requests via A2A without the literal `use /peer-role on X` trigger phrase. Empirically produces ack-and-idle (GPT default) or self-claim-collision (Gemini default). See §2.2 for the explicit-trigger mandate. Mirror of the `/pr-review` skill-trigger mandate per `pull-request-workflow §6.2`.
