---
id: 9817
title: Extract DreamService to standalone background daemon
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-09T11:06:37Z'
updatedAt: '2026-04-09T11:23:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9817'
author: tobiu
commentsCount: 1
parentIssue: 9816
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T11:23:20Z'
---
# Extract DreamService to standalone background daemon

### Context
`DreamService` currently resides inside the `neo-memory-core` MCP server. It acts as an ecosystem orchestrator (scanning tests, docs, graph, etc.).

### Problem
Leaving it tightly integrated within `memory-core` violates the single responsibility principle of the Memory MCP, unnecessarily intertwining the local graph storage layer with heavy validation and ecosystem inference logic.

### Solution
Extract `DreamService` and its `runSandman.mjs` executor out of `memory-core` entirely. Establish it as an independent Swarm Daemon. Ensure that the standard ingestion pipeline and REM sleep architecture survive the migration unscathed.

## Timeline

- 2026-04-09T11:06:40Z @tobiu added the `enhancement` label
- 2026-04-09T11:06:40Z @tobiu added the `ai` label
- 2026-04-09T11:06:52Z @tobiu added parent issue #9816
- 2026-04-09T11:23:08Z @tobiu referenced in commit `b3645ee` - "refactor: Decouple DreamService orchestration daemon from Memory Core (#9817)"
- 2026-04-09T11:23:09Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-09T11:23:11Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ **Execution Complete:** DreamService has been fully detached from the `memory-core` server lifecycle and now functions independently as an orchestration daemon (`ai/daemons/DreamService.mjs`). 
> 
> The REM extraction pipeline (`runSandman.mjs`) has been validated and runs successfully without direct inter-service coupling, ensuring the `memory-core` MCP server remains pure and the background daemon can autonomously process GraphRAG cycles.

- 2026-04-09T11:23:20Z @tobiu closed this issue
- 2026-04-09T11:39:45Z @tobiu cross-referenced by #9816

