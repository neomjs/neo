---
id: 9866
title: Enforce Retrospective 9492 Guardrails & Self-Evolving Systems
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-10T16:22:25Z'
updatedAt: '2026-04-12T16:59:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9866'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-10T16:30:07Z'
---
# Enforce Retrospective 9492 Guardrails & Self-Evolving Systems

This issue integrates the critical architectural learnings from the derailed Grid Multi-Body session (Epic #9492) and codifies our "Self-Evolving Systems" mandate into the core agent operational files (`AGENTS.md` and `AGENTS_STARTUP.md`).

**The Problem:**
1. During complex structural state synchronization, the agent succumbed to "Whack-A-Mole" debugging: repeatedly running complete Whitebox E2E suites on slight hypotheses instead of mathematically verifying VDOM structures directly using targeted Neural Link agent tools.
2. The agent protocols lacked an explicit mandate to scale meta-level insights back into the system's operational framework rapidly.

**The Architectural Reality:**
We have modified the core agent operational files to patch these gaps:
1. `AGENTS.md` (Section 10) now mandates prioritizing **direct Neural Link agent introspection** (e.g. `inspect_component_render_tree`) to validate VDOM payloads dynamically before falling back to executing full Whitebox E2E test suites.
2. `AGENTS.md` (Section 13) and `AGENTS_STARTUP.md` (Section 3.3) have been expanded to dictate a "Self-Evolving System." Agents must now actively seek and propose workflow, collaboration, and protocol enhancements based on chronological friction analysis.
3. `AGENTS.md` mandates drafting State Topologies (`ideation-sandbox`) before complex DOM-reconciliation tasks.
4. `AGENTS.md` introduces a "Productive Failure Loop" (3-5x threshold) circuit breaker tracking via local artifacts, avoiding remote tool pollution, alongside a 25-turn global hard stop limit.

**Avoided Traps:**
We rejected standard "black-box E2E" assumptions, rigidly enforcing Neo's Whitebox E2E architecture. We also deliberately avoided enforcing remote GitHub Discussions (`ideation-sandbox`) for short-term loop tripwires, protecting remote repositories from transient debugging pollution, reserving remote nodes only for systemic architectural shifts.

## Timeline

- 2026-04-10T16:22:26Z @tobiu added the `enhancement` label
- 2026-04-10T16:22:27Z @tobiu added the `ai` label
- 2026-04-10T16:22:43Z @tobiu referenced in commit `ec1b5f9` - "docs(agent): Enforce Retrospective 9492 Guardrails & Self-Evolving Systems (#9866)

- Prioritizes Whitebox E2E Neural Link VDOM inspection natively over test suites.
- Formalizes the Self-Evolving Systems mandate (meta-level enhancements).
- Limits UI-centric requirements to frontend tasks globally.
- Standardizes the 3-5x Productive Failure Tripwire and 25-turn guardrail."
- 2026-04-10T16:22:54Z @tobiu cross-referenced by PR #9867
- 2026-04-10T16:30:07Z @tobiu referenced in commit `f8aeb5d` - "docs(agent): Enforce Retrospective 9492 Guardrails & Self-Evolving Systems (#9866) (#9867)

- Prioritizes Whitebox E2E Neural Link VDOM inspection natively over test suites.
- Formalizes the Self-Evolving Systems mandate (meta-level enhancements).
- Limits UI-centric requirements to frontend tasks globally.
- Standardizes the 3-5x Productive Failure Tripwire and 25-turn guardrail."
- 2026-04-10T16:30:07Z @tobiu closed this issue
- 2026-04-12T16:59:46Z @tobiu assigned to @tobiu

