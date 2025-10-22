---
id: 6980
title: Remove now obsolete `StateProvider#parseConfig()` calls within `src`
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-07T18:11:08Z'
updatedAt: '2025-07-07T20:42:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6980'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-07T20:42:10Z'
---
# Remove now obsolete `StateProvider#parseConfig()` calls within `src`

**Reported by:** @tobiu on 2025-07-07

* 3 spots left

## Comments

### @tobiu - 2025-07-07 20:41

while `parseConfig()` no longer exists, we need to use the 3 spots to call `createBindings()`

