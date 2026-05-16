---
id: 1548
title: 'SharedDialog.view.MainContainerController: onDragMove() => show & hide the proxyEl'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-03-18T00:14:33Z'
updatedAt: '2021-03-18T00:15:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1548'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-18T00:15:08Z'
---
# SharedDialog.view.MainContainerController: onDragMove() => show & hide the proxyEl

i noticed that in case you drag very fast across windows, the proxy inside the non active window does not always get moved out of the visible area, which looks broken.

to ensure there is no glitch, we should add `visibility: 'hidden'` to it, in case we drag fully inside the drag:start window.

we can add this call into onDragMove() => the style will only get changed in case there is a delta (so it will just happen once when passing the window border).

## Timeline

- 2021-03-18T00:14:33Z @tobiu added the `enhancement` label
- 2021-03-18T00:14:48Z @tobiu assigned to @tobiu
- 2021-03-18T00:15:04Z @tobiu referenced in commit `d07e4c9` - "SharedDialog.view.MainContainerController: onDragMove() => show & hide the proxyEl #1548"
- 2021-03-18T00:15:08Z @tobiu closed this issue

