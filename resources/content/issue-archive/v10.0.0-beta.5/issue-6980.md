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
blockedBy: []
blocking: []
closedAt: '2025-07-07T20:42:10Z'
---
# Remove now obsolete `StateProvider#parseConfig()` calls within `src`

* 3 spots left

## Timeline

- 2025-07-07T18:11:08Z @tobiu assigned to @tobiu
- 2025-07-07T18:11:09Z @tobiu added the `enhancement` label
- 2025-07-07T18:11:29Z @tobiu referenced in commit `d45da2d` - "Remove now obsolete StateProvider#parseConfig() calls within src #6980"
- 2025-07-07T18:11:39Z @tobiu closed this issue
### @tobiu - 2025-07-07T20:41:17Z

while `parseConfig()` no longer exists, we need to use the 3 spots to call `createBindings()`

- 2025-07-07T20:41:18Z @tobiu reopened this issue
- 2025-07-07T20:41:57Z @tobiu referenced in commit `bd54261` - "#6980 createBindings()"
- 2025-07-07T20:42:10Z @tobiu closed this issue
- 2025-07-09T00:10:51Z @tobiu referenced in commit `5b0c13b` - "Remove now obsolete StateProvider#parseConfig() calls within src #6980"
- 2025-07-09T00:10:51Z @tobiu referenced in commit `35d1fc2` - "#6980 createBindings()"

