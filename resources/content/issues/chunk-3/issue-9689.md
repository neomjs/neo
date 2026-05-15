---
id: 9689
title: 'Agent Skill: Contextual Pre-Briefer'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-04T13:43:46Z'
updatedAt: '2026-04-04T14:14:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9689'
author: tobiu
commentsCount: 1
parentIssue: 9687
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T14:14:18Z'
---
# Agent Skill: Contextual Pre-Briefer

Build an MCP tool (`pre_brief_session`) that queries the Native Graph Database for the highest-weight edges connected to the currently targeted Epic, auto-loading key files, constraints, and prior architectural decisions to eliminate human context-switching friction.

## Timeline

- 2026-04-04T13:43:48Z @tobiu added the `enhancement` label
- 2026-04-04T13:43:49Z @tobiu added the `ai` label
- 2026-04-04T13:44:02Z @tobiu added parent issue #9687
- 2026-04-04T14:13:54Z @tobiu referenced in commit `d76cc8b` - "feat: Add Contextual Pre-Briefer MCP Tool to Memory Core (#9689)"
### @tobiu - 2026-04-04T14:14:17Z

Phase 1: Contextual Pre-Briefer successfully implemented, tested locally, and pushed.

Tasks accomplished:
1. Implemented `MemoryService.preBriefSession` for structural vector mapping.
2. Wired endpoint `/context/pre_brief` in `openapi.yaml`.
3. Created Playwright unit tests for topological extraction `getNeighbors()` solving WAL concurrency.

- 2026-04-04T14:14:18Z @tobiu closed this issue
- 2026-04-04T14:14:46Z @tobiu assigned to @tobiu

