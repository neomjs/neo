---
id: 9730
title: 'Intermittent `TypeError: Cannot read properties of undefined` in GraphService Test Suite'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-06T00:28:12Z'
updatedAt: '2026-04-06T00:43:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9730'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-06T00:43:05Z'
---
# Intermittent `TypeError: Cannot read properties of undefined` in GraphService Test Suite

### Problem
The `GraphService` test suite is experiencing intermittent `TypeError` failures (e.g., `Cannot read properties of undefined (reading 'length')`) during CI runs across the massive parallel execution. The stack trace consistently points to instances where nodes fetched from SQLite via lazy-loading return unexpectedly empty states, leading to failing destructuring assertions downstream such as `vicinity.nodes.length` or `expect(neighbors.length)`.

### Investigation Focus
The failures occur consistently under high concurrency (e.g., when the entire `test/playwright/unit/ai/` suite triggers) and correlate directly to `loadNodeVicinitySync` cache-miss rehydration flows on the Native SQLite adapter. The isolated test suite `GraphService.spec.mjs` executes identically without error.

### Action Plan
1. Add explicit diagnostic trace logging directly onto the `SQLite.loadNodeVicinitySync` database adapter method parameters and early return statements.
2. Ensure subsequent CI pipelines surface the actual passed node footprints causing the cache-miss failures inside Playwright logs.

## Timeline

- 2026-04-06T00:28:15Z @tobiu added the `bug` label
- 2026-04-06T00:28:15Z @tobiu added the `ai` label
- 2026-04-06T00:42:48Z @tobiu referenced in commit `e70bef2` - "test(GraphService): Isolate SQLite connections and nullify GraphService Singleton to prevent Worker cross-contamination (#9730)

- Added explicit closing of SQLite files in afterAll hooks
- Nullified GraphService singleton to enforce a clean instance for subsequent Playwright test files in the same worker processes
- Suppressed noisy warning logs from ChromaManager test mocks"
- 2026-04-06T00:42:57Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-06T00:43:04Z

Fixed by nullifying GraphService in Playwright worker cleanup logic so Singletons do not cross-pollinate with orphaned database connections.

- 2026-04-06T00:43:05Z @tobiu closed this issue

