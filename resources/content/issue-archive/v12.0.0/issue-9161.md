---
id: 9161
title: '[DevIndex] Fix Redundant Store Load via createAllItems hook'
state: CLOSED
labels:
  - bug
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-02-15T02:57:37Z'
updatedAt: '2026-02-15T03:00:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9161'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-15T03:00:27Z'
---
# [DevIndex] Fix Redundant Store Load via createAllItems hook

The `allItems` backup collection created during filtering inherits the `autoLoad: true` config from the main store, causing a redundant data fetch.
This fix introduces a protected `createAllItems(config)` hook in `Neo.collection.Base`, which is then overridden in `Neo.data.Store` to explicitly set `autoLoad: false`.
This ensures clean separation of concerns and prevents the performance regression.

## Timeline

- 2026-02-15T02:57:38Z @tobiu added the `bug` label
- 2026-02-15T02:57:39Z @tobiu added the `ai` label
- 2026-02-15T02:57:39Z @tobiu added the `performance` label
- 2026-02-15T02:59:51Z @tobiu referenced in commit `2db4b73` - "fix(data): Prevent redundant store load when filtering via createAllItems hook (#9161)"
- 2026-02-15T02:59:58Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-15T03:00:08Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the fix by introducing a `createAllItems(config)` hook in `Neo.collection.Base`.
> This hook is overridden in `Neo.data.Store` to explicitly set `config.autoLoad = false` for the backup collection.
> This prevents the redundant data fetch when filtering for the first time.

- 2026-02-15T03:00:28Z @tobiu closed this issue

