---
id: 6687
title: 'Portal.view.learn.MainContainerController: remove onConstructed()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-05-02T16:18:16Z'
updatedAt: '2025-05-02T16:19:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6687'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-05-02T16:19:24Z'
---
# Portal.view.learn.MainContainerController: remove onConstructed()

looks like old code from @maxrahder, which no longer makes sense:

* `construct()`is getting the search params from main
* `onConstructed()` is doing exactly the same, and the rest of the logic is commented out

I will just remove it. Max, if you ever need the `EditorConfig.json` part, feel free to create a ticket & PR (the file was never inside the repo).

## Timeline

- 2025-05-02T16:18:16Z @tobiu added the `enhancement` label
- 2025-05-02T16:18:16Z @tobiu assigned to @tobiu
- 2025-05-02T16:19:04Z @tobiu referenced in commit `0c897ce` - "Portal.view.learn.MainContainerController: remove onConstructed() #6687"
- 2025-05-02T16:19:24Z @tobiu closed this issue

