---
id: 9812
title: Enforce Meta Gates and Cascade Definitions in Agent Manuals
state: CLOSED
labels:
  - documentation
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-09T09:22:49Z'
updatedAt: '2026-04-09T09:25:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9812'
author: tobiu
commentsCount: 1
parentIssue: 9811
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T09:25:48Z'
---
# Enforce Meta Gates and Cascade Definitions in Agent Manuals

# Strategic Context
Agent swarm stability relies on rigid markdown policies for operational constraints. Currently, agents lack instruction to actively deduplicate tasks or properly manage Epic-to-Issue boundaries, causing protocol breakdowns. 

# Architectural Reality
`AGENTS.md` and `AGENTS_STARTUP.md` must be structurally expanded. 
- **Gate 0: Deduplication**: Requires agents to run `grep_search` on `resources/content/issues` and `resources/content/discussions` to prevent duplicate tracking before creation.
- **Epic Granularity Constraints**: Explicitly restricts Epics to only represent architectural orchestrations involving separate actionable commits, preventing "one-shots". 

## Timeline

- 2026-04-09T09:22:51Z @tobiu added the `documentation` label
- 2026-04-09T09:22:51Z @tobiu added the `ai` label
- 2026-04-09T09:22:52Z @tobiu added the `architecture` label
- 2026-04-09T09:23:17Z @tobiu added parent issue #9811
- 2026-04-09T09:25:32Z @tobiu referenced in commit `26ad74a` - "docs: Enforce Meta Gates and Cascade Definitions in Agent Manuals (#9812)"
- 2026-04-09T09:25:36Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-09T09:25:47Z

Successfully added Gate 0 (Deduplication) and Epic Granularity constraints to the AGENTS.md and AGENTS_STARTUP.md manual to ensure strict ticket hygiene and prevent 'one-shots'.

- 2026-04-09T09:25:48Z @tobiu closed this issue
- 2026-04-09T09:26:05Z @tobiu cross-referenced by #9811

