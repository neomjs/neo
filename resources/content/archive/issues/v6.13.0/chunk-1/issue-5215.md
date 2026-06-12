---
id: 5215
title: 'list.Base: afterSetActiveIndex()'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-02-12T14:05:05Z'
updatedAt: '2024-02-13T18:55:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5215'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-02-13T18:55:28Z'
---
# list.Base: afterSetActiveIndex()

`activeIndex` is intended as a shortcut for managing the current selection (allowing bindings).

The logic got changed to move the focus instead, which is causing issues inside our client app.

I will revert the logic to its initial state and add a new config: `focusIndex` to keep the new logic.

I will create a branch & PR for this one. @ExtAnimal 

## Timeline

- 2024-02-12T14:05:05Z @tobiu added the `bug` label
- 2024-02-12T14:05:05Z @tobiu assigned to @tobiu
### @tobiu - 2024-02-12T14:13:13Z

to be clear:
https://github.com/neomjs/neo/assets/1177434/b99a46e3-abc7-4c95-babb-b8281c44c73b



- 2024-02-12T15:03:49Z @tobiu referenced in commit `d1944b8` - "list.Base: afterSetActiveIndex() #5215"
- 2024-02-12T15:04:55Z @tobiu cross-referenced by PR #5216
- 2024-02-13T14:44:23Z @tobiu referenced in commit `319408d` - "list.Base: afterSetActiveIndex() #5215"
- 2024-02-13T18:55:28Z @tobiu closed this issue
- 2024-03-26T16:29:29Z @tobiu referenced in commit `4175fa6` - "list.Base: afterSetActiveIndex() #5215"

