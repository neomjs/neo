---
id: 9706
title: 'Epic: Autonomous Priority Graph Engine'
state: CLOSED
labels:
  - epic
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-04T20:23:53Z'
updatedAt: '2026-04-04T21:06:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9706'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-04T21:06:30Z'
---
# Epic: Autonomous Priority Graph Engine

This epic covers the architectural pivot from LLM-driven priority generation to a deterministic, structural mathematical graph traversal based on Github issue dependencies.

Tasks:
- Parse YAML metadata (`subIssues`, `blockedBy`, `parentIssue`, `blocking`) into topological edges (`PARENT_OF`, `CHILD_OF`, `BLOCKS`, `BLOCKED_BY`) during `DreamService.ingestIssueStates()`.
- Replace Ollama JSON synthesis in `DreamService.synthesizeGoldenPath()` with a mathematical SQLite graph traversal that finds the highest-weight unblocked leaf node to use as the Strategic Golden Path.
- Re-inforce the Autonomous Strategy Orchestrator rules allowing the agent to self-launch based on this derived priority in `AGENTS_STARTUP.md`.

## Timeline

- 2026-04-04T20:23:54Z @tobiu added the `epic` label
- 2026-04-04T20:23:54Z @tobiu added the `ai` label
- 2026-04-04T20:23:54Z @tobiu added the `architecture` label
- 2026-04-04T20:35:12Z @tobiu referenced in commit `8a3bc3a` - "feat: Refining Autonomous Startup Protocol and Graph ID Parsing (#9706)"
- 2026-04-04T21:06:29Z @tobiu assigned to @tobiu
- 2026-04-04T21:06:30Z @tobiu closed this issue

