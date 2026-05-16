---
id: 9731
title: Stabilize Memory Core Backend Initialization
state: CLOSED
labels:
  - bug
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-04-06T01:35:06Z'
updatedAt: '2026-04-06T01:35:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9731'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-06T01:35:52Z'
---
# Stabilize Memory Core Backend Initialization

### Problem
The Memory Core initialization lifecycle suffered from critical race conditions caused by manual `await instance.initAsync()` calls firing alongside the framework's native constructor microtask loop. This triggered duplicate concurrent backend bootstraps (specifically in the SQLite graph database), breaking the WAL and resulting in severe locking errors during automated test execution. Additionally, the `StorageRouter` was being unnecessarily exposed and example scripts relied on legacy hardcoded backup directories.

### Proposed Solution
1. **Fix Initialization Race Condition:** Replace explicit `.initAsync()` calls on newly instantiated services with `.ready()` to guarantee single-pass thread safety.
2. **Encapsulate Storage Router:** Update `MemoryService`, `DatabaseService`, and `SummaryService` to handle `await StorageRouter.ready()` within their own `initAsync` overrides, decoupling the public API.
3. **Refactor Example Scripts:** Standardize `ai/examples/` (like `db-backup.mjs` and `db-restore.mjs`) to boot specifically via the core services instead of exposing internal managers, and point to the centralized `aiConfig.backupPath` instead of hardcoded `dist` directories.

## Timeline

- 2026-04-06T01:35:08Z @tobiu added the `bug` label
- 2026-04-06T01:35:08Z @tobiu added the `ai` label
- 2026-04-06T01:35:08Z @tobiu added the `refactoring` label
- 2026-04-06T01:35:48Z @tobiu assigned to @tobiu
- 2026-04-06T01:35:50Z @tobiu referenced in commit `ae9f6b8` - "fix: Stabilize memory core backend init sequences (#9731)"
### @tobiu - 2026-04-06T01:35:51Z

Fixed the race conditions across Agent, examples, and services by relying on standard .ready() lifecycles. Pushed the changes.

- 2026-04-06T01:35:53Z @tobiu closed this issue

