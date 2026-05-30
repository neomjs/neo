---
id: 2076
title: 'Neo.Main: remove queueUpdate()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-05-17T21:40:54Z'
updatedAt: '2021-05-17T22:18:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2076'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-17T22:18:53Z'
---
# Neo.Main: remove queueUpdate()

read & write is enough for the animation frame queue.

## Timeline

- 2021-05-17T21:40:54Z @tobiu added the `enhancement` label
- 2021-05-17T21:40:54Z @tobiu assigned to @tobiu
- 2021-05-17T21:44:30Z @tobiu referenced in commit `fa1c513` - "Neo.Main: remove queueUpdate() #2076"
- 2021-05-17T21:44:35Z @tobiu closed this issue
- 2021-05-17T22:07:28Z @tobiu reopened this issue
### @tobiu - 2021-05-17T22:18:16Z

wishful thinking. the mode does get passed to DomAccess to trigger write() or update().
combining those is a lot of work and not worth it.

- 2021-05-17T22:18:46Z @tobiu referenced in commit `406c931` - "Neo.Main: remove queueUpdate() #2076"
- 2021-05-17T22:18:53Z @tobiu closed this issue

