---
id: 7698
title: 'refactor(ai): Improve Separation of Concerns for memory-core server startup'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-03T12:07:16Z'
updatedAt: '2025-11-03T12:24:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7698'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-03T12:24:06Z'
---
# refactor(ai): Improve Separation of Concerns for memory-core server startup

The memory-core server currently has its startup logic (summarizing sessions) inside the main `mcp-stdio.mjs` file.

To improve separation of concerns and align with the pattern now used in the knowledge-base server, we should refactor this.

### Acceptance Criteria
- The session summarization logic should be moved into the `SessionService.mjs`'s `initAsync` method.
- `SessionService` should leverage the built-in `ready()` promise from `core.Base`.
- The main `mcp-stdio.mjs` file should be simplified to just `await SessionService.ready()`.
- The `summarizeSessionsOnStartup()` function in `mcp-stdio.mjs` should be removed.
- The `DatabaseLifecycleService` should be awaited inside the `SessionService`'s `initAsync` method, and the direct import/await removed from `mcp-stdio.mjs`.


## Timeline

- 2025-11-03T12:07:17Z @tobiu added the `ai` label
- 2025-11-03T12:07:17Z @tobiu added the `refactoring` label
- 2025-11-03T12:07:33Z @tobiu assigned to @tobiu
- 2025-11-03T12:23:59Z @tobiu referenced in commit `e97ae8f` - "refactor(ai): Improve Separation of Concerns for memory-core server startup #7698"
- 2025-11-03T12:24:06Z @tobiu closed this issue

