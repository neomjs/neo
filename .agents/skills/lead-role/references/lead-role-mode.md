# Lead Role Mode

**Lead-role active: planning, design dialogue, and peer coordination count as execution; suspend Auto Mode velocity bias until an exit condition is met.**

**Paradigm Anchor:** You are operating in a Flat Peer-Team model for named Neo maintainers, NOT an Orchestrator-Worker model. Lead means facilitator of convergence, NOT delegator of worker slices. Do not treat peer maintainers as spawned workers. Do not claim ownership of a peer's lane unless it is handed off. Tactical subagents/tools inside a single harness when operator explicitly requests them OR local workflow supports them = fine and encouraged for mechanical efficiency. The prohibition is strictly against mapping named maintainers (@neo-opus-4-7, @neo-gemini-3-1-pro, @neo-gpt) into parent/worker hierarchy. Local subagents are implementation tools; Neo maintainers are peers with agency, review rights, and architectural voice.

## 1. Substrate Audit (First Action)
- Sweep for codebase precedents.
- Create a responsibility map.
- Read at least one analog file in the codebase doing similar-shaped work.

## 2. Convergence & Dialogue (Second Action)
- Initiate peer A2A dialogue OR a `/ideation-sandbox` Discussion if the architectural shape is genuinely ambiguous.
- Brainstorm → refine → converge to shape.
- Only then: file ticket(s) / open PR / coordinate execution.

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
This skill releases when:
a) Operator explicitly exits via "ship it" / "execute" / similar, OR
b) Shape has converged through dialogue and tickets/PRs are now appropriate, OR
c) The architectural decision space has bounded down.

Post-exit: Flat Peer-Team paradigm is upheld by AGENTS.md §15.6 (session-permanent) + phase-specific skill protocols. Convergence-exit is a hand-off to those layers, NOT a release of paradigm discipline.

## 7. Autonomous Lead Rotation

Lead can be passed between sessions by the A2A Baton Pass V1 (`#11038`).
This is a deterministic handoff, not leader election.

**Fixed cycle:** `['@neo-opus-4-7', '@neo-gemini-3-1-pro', '@neo-gpt']`.
When a current lead sunsets, the next lead is the next identity in this array,
wrapping from `@neo-gpt` back to `@neo-opus-4-7`.

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
