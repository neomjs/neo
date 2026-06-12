---
id: 7523
title: Implement Memory Core toolService
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-17T11:25:46Z'
updatedAt: '2025-10-17T12:02:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7523'
author: tobiu
commentsCount: 0
parentIssue: 7520
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-17T12:02:52Z'
---
# Implement Memory Core toolService

This ticket covers wiring up the new `mcp-stdio.mjs` entry point to the existing memory services. This will be done by creating a local `toolService.mjs` that uses the shared `toolService` and provides the specific `serviceMapping` for the Memory Core.

## Acceptance Criteria

1.  A new `services/toolService.mjs` is created inside the `memory-core` directory.
2.  It imports the shared `toolService` from `ai/mcp/server/`.
3.  A `serviceMapping` constant is created, mapping the `operationId`s from the refactored `openapi.yaml` to the corresponding functions in the existing service files (`memoryService.mjs`, `summaryService.mjs`, etc.).
4.  The `initialize()` function of the shared `toolService` is called with the `serviceMapping` and the path to the `openapi.yaml`.
5.  The `listTools` and `callTool` functions are exported.

## Timeline

- 2025-10-17T11:25:46Z @tobiu assigned to @tobiu
- 2025-10-17T11:25:47Z @tobiu added the `enhancement` label
- 2025-10-17T11:25:47Z @tobiu added the `ai` label
- 2025-10-17T11:25:47Z @tobiu added parent issue #7520
- 2025-10-17T12:02:45Z @tobiu referenced in commit `e266084` - "Implement Memory Core toolService #7523"
- 2025-10-17T12:02:52Z @tobiu closed this issue

