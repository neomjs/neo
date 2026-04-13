---
id: 9948
title: Integrate "Stepping Back" Self-Reflection Protocol into Agent Definition of Done
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-13T08:03:04Z'
updatedAt: '2026-04-13T08:59:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9948'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-13T08:22:21Z'
---
# Integrate "Stepping Back" Self-Reflection Protocol into Agent Definition of Done

### The "Excitement Rush" Problem
Our current `Ticket Closure Protocol (Definition of Done)` structurally triggers an "excitement rush" failure mode. In the current protocol, the mandate to Squash Merge (`gh pr merge`) conflicts with the Human Handoff ("Do not merge it yourself") rule. This leads the overarching Swarm Intelligence to bypass both the final Human quality gates and the contextual `pr-review` ingestion checkpoints. 

Without a programmatic pause built into the transactional sequence, Agents act purely in an "Implementation State" and fail to inject Native Graph evaluations. Technical or architectural debt risks being hastily bound into the `dev` branch.

### The Solution: "The Stepping Back Strategy"
To optimize the Swarm framework for deep autonomous multi-machine orchestration—and to maximize the pair-programming dynamic with humans—we must transition the Agent into a **"Self-Reflection State"** as a final, mandatory execution node.

We will refactor the `AGENTS_STARTUP.md` (and consequently `AGENTS.md`) to encode this new cognitive loop:

1. **The PR is a Hard Boundary**: The Agent generates the `gh pr create` as usual. This formally pauses the purely iterative "Developer Persona."
2. **The Reflection Phase**: The Agent MUST execute the `pr-review` skill against its own generated PR, analyzing its own implementation objectively.
3. **Iterative Polish vs. Follow-up Tickets**:
    - If the review uncovers minor gaps (e.g., missed JSDoc or missing Anchor & Echo context), the Agent pushes rapid successive commits before finishing entirely.
    - If the review uncovers a mathematically superior structural architecture that is out-of-scope for the current execution, the Agent generates a Follow-Up Extrapolation Epic mathematically bound to the original PR. 
4. **Architectural Handoff**: The Agent securely posts its evaluation metrics via Github Issue Comments and HALTS. 
5. **No Autonomous Merging**: We must purge any instructional phrasing (like `MANDATORY: Squash Merge`) that inadvertently triggers automated merges by the AI.

### Execution Path
1. Identify and remove any conflicting instructions inside `AGENTS_STARTUP.md` / `AGENTS.md` regarding autonomous `gh pr merge` constraints.
2. Formally bake the Self-Reflection loops utilizing the `pr-review` Skill natively into the "Ticket Closure Protocol".
3. Update `pr-review-guide.md` and `pr-review-template.md` (if needed) to reinforce this self-audit execution.

## Timeline

- 2026-04-13T08:03:07Z @tobiu added the `enhancement` label
- 2026-04-13T08:03:07Z @tobiu added the `ai` label
- 2026-04-13T08:03:07Z @tobiu added the `architecture` label
- 2026-04-13T08:08:09Z @tobiu referenced in commit `b59d3a5` - "docs: integrate reflection protocol into definition of done (#9948)"
- 2026-04-13T08:08:25Z @tobiu cross-referenced by PR #9949
- 2026-04-13T08:22:21Z @tobiu closed this issue
- 2026-04-13T08:22:21Z @tobiu referenced in commit `aeb4de8` - "docs: Integrate "Stepping Back" Reflection Protocol into Definition of Done (#9948) (#9949)

* docs: integrate reflection protocol into definition of done (#9948)

* docs: offload cognitive instructions to pr-review-guide

* docs: explicitly trigger lateral thinking pathways in reflection mode"
- 2026-04-13T08:59:17Z @tobiu assigned to @tobiu

