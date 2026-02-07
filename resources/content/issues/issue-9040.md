---
id: 9040
title: 'Refactor: Make DevRank Manager a Singleton'
state: OPEN
labels:
  - ai
  - refactoring
assignees: []
createdAt: '2026-02-07T21:07:48Z'
updatedAt: '2026-02-07T21:07:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9040'
author: tobiu
commentsCount: 0
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor: Make DevRank Manager a Singleton

Refactor `apps/devrank/services/Manager.mjs` to be a singleton class.

**Current State:**
- `Manager.mjs` is a standard class.
- `cli.mjs` manually instantiates it via `Neo.create(Manager)`.
- All other services in the directory (`Spider`, `Storage`, `GitHub`, `Updater`, `Cleanup`, `Config`) are singletons.

**Goal:**
- Align `Manager` with the service architecture.
- Simplify `cli.mjs` usage.

**Changes:**
1.  Add `singleton: true` to `Manager.mjs`.
2.  Update `cli.mjs` to call `Manager.main()` directly (as the import will now be the instance).

## Timeline

- 2026-02-07T21:07:50Z @tobiu added the `ai` label
- 2026-02-07T21:07:50Z @tobiu added the `refactoring` label
- 2026-02-07T21:08:02Z @tobiu added parent issue #8930

