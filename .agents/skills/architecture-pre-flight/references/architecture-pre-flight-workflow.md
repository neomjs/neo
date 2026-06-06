# Architecture Pre-Flight Workflow

This skill acts as the "router-of-uncertainty" for high-level architectural decisions, new daemons, subsystems, or cross-substrate refactors.

## Trigger Rule

Fire only when no narrower mandatory trigger applies OR when the proposed work spans multiple distinct trigger families.

## Bypass Rules (Preventing Substrate Fatigue)

Do NOT invoke this skill for routine or already-governed actions. If a more specific pre-flight exists, use it instead:
- Plainly `.mjs` placement? Route to `/structural-pre-flight`.
- Plainly skill creation? Route to `/create-skill`.
- Plainly substrate placement (turn/skill-loaded memory)? Route to `/turn-memory-pre-flight`.
- Plainly tech-debt sweep? Route to `/tech-debt-radar`.
- Plainly discussion-grade uncertainty? Route to `/ideation-sandbox`.

**This is NOT a universal mandatory prelude** — invoking it on every change recreates the substrate fatigue it's meant to reduce.

## Output Requirement

When you invoke this skill to make a routing decision, your reasoning/output MUST include:
1. The **selected discipline** (the skill you are routing to).
2. **Why not `<nearest alternative>`** (why another discipline was rejected).
3. The **blast-radius class** of the change.

## The Architectural Routing Protocol

When facing genuine cross-substrate architectural ambiguity, follow these steps:

1. **Verify Before Assert (Tier 1):** Execute local tool runs to gather empirical evidence. Check the Knowledge Base (`ask_knowledge_base`) and historical discussions (`memory-mining`).
2. **Impact Radius Assessment:** Determine the scope of the change. Does it alter core primitives? Does it introduce new build steps or dependencies?
3. **Escalate (Tier 3/4):** If the change is irreversible, introduces breaking API shifts, or creates new daemons/subsystems, you MUST route the proposal to the `/ideation-sandbox` for peer review before implementation. Do not proceed with implementation until consensus is reached.
4. **Document the Decision:** If the change is reversible and within local authority (Tier 2), implement it and document the rationale clearly in the PR description, referencing the evidence gathered in Step 1.

## Empirical Anchors

- **PR #11250:** Empirical anchor for substrate-placement gaps.
- **#10449:** `ai/daemons/wake/daemon.mjs` (originally misplaced in `ai/scripts/` as `bridge-daemon.mjs`) misplacement origin.
- **PR #11008 → #11009:** `orchestrator-daemon.mjs` misplacement and corrective action.
- **PR #11246 → #11251:** One-shot script "playbook" framing corrective action.
- **Epic #11256:** Serves as the router-of-uncertainty anchor itself.

## Cross-Skill References

- Substrate placement decisions route to `/turn-memory-pre-flight`.
- `.mjs` file placements route to `/structural-pre-flight`.
- Skill creation routes to `/create-skill`.
