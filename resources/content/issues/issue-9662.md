---
id: 9662
title: 'Dream Mode Phase 3: GraphRAG Topology & REM Mode Orchestration'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-03T14:46:30Z'
updatedAt: '2026-04-04T00:04:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9662'
author: tobiu
commentsCount: 1
parentIssue: 9638
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T00:04:14Z'
---
# Dream Mode Phase 3: GraphRAG Topology & REM Mode Orchestration

### Overview
This ticket encompasses Phase 3 of the Swarm Orchestrator "Dream Mode" epic (#9638). Now that we possess autonomous sub-agent delegation (`Browser`, `Librarian`), native MCP tool reflection, and 50-turn memory horizons, we need to implement the overarching cognitive strategies that drive true autonomy.

### Objectives
1. **GraphRAG Topology Mapping:** Introduce mechanisms for agents to build relationship graphs of the codebase structure (components, mixins, styles). We must move away from flat vector retrieval to traversable dependency maps.
2. **REM Mode (Offline Dreaming):** Configure the background loop where an agent can operate completely autonomously when the developer is idle.
    - Identify deferred/TODO items in the memory core.
    - Autonomously spawn structural tests, format refactoring, or documentation generation.
    - Curate new Knowledge Items (KIs) without human prompting.

### Acceptance Criteria
- [ ] Implement `GraphRAG` topological indexing logic for codebase components.
- [ ] Create an offline trigger or background scheduling system for `REM Mode`.
- [ ] Agent successfully refactors a component or creates tests completely offline, persisting the result to memory.

## Timeline

- 2026-04-03T14:46:31Z @tobiu added the `enhancement` label
- 2026-04-03T14:46:31Z @tobiu added the `ai` label
- 2026-04-03T14:46:38Z @tobiu added parent issue #9638
- 2026-04-03T14:49:31Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-04T00:04:13Z

Superseded by the new architecture roadmap defined in Epic #9671 (specifically #9673 and #9674).

- 2026-04-04T00:04:14Z @tobiu closed this issue

