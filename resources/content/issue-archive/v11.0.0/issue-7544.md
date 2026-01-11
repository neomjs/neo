---
id: 7544
title: Convert sessionService to SessionService Neo.mjs Class
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-18T13:23:15Z'
updatedAt: '2025-10-18T13:35:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7544'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-18T13:35:33Z'
---
# Convert sessionService to SessionService Neo.mjs Class

This ticket covers refactoring `ai/mcp/server/memory-core/services/sessionService.mjs` into a singleton class that extends `Neo.core.Base`. The file will also be renamed to `SessionService.mjs` to follow a more consistent naming convention. This service handles summarizing agent sessions.

## Acceptance Criteria

1.  The file `ai/mcp/server/memory-core/services/sessionService.mjs` is renamed to `ai/mcp/server/memory-core/services/SessionService.mjs`.
2.  The `sessionService.mjs` module is refactored into a `SessionService` class.
3.  The `SessionService` class extends `Neo.core.Base` and is configured as a singleton.
4.  Existing functions (`summarizeSessions`, `SessionSummarizer`'s methods) are converted into class methods or integrated into the `SessionService` class.
5.  The `ai/mcp/server/memory-core/services/toolService.mjs` is updated to import the `SessionService` singleton and map its methods.
6.  Any other services that depend on `sessionService` are updated to use the new `SessionService` singleton instance.
7.  All related tools (e.g., `summarize_sessions`) continue to function correctly after the refactoring.

## Timeline

- 2025-10-18T13:23:16Z @tobiu assigned to @tobiu
- 2025-10-18T13:23:17Z @tobiu added the `enhancement` label
- 2025-10-18T13:23:17Z @tobiu added parent issue #7536
- 2025-10-18T13:23:17Z @tobiu added the `ai` label
- 2025-10-18T13:35:17Z @tobiu referenced in commit `254c611` - "Convert sessionService to SessionService Neo.mjs Class #7544"
- 2025-10-18T13:35:33Z @tobiu closed this issue

