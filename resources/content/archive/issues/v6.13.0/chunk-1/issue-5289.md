---
id: 5289
title: 'Portal.view.learn.ContentTreeList: showdown (markdown) errors'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-03-02T16:45:10Z'
updatedAt: '2024-03-05T16:07:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5289'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-03-05T16:07:58Z'
---
# Portal.view.learn.ContentTreeList: showdown (markdown) errors

@maxrahder 

<img width="548" alt="Screenshot 2024-03-02 at 17 43 02" src="https://github.com/neomjs/neo/assets/1177434/8b0d57f4-9a3b-45eb-a5a2-56e524f03334">

i am getting this one around 40% of the page loads. we obviously need to fix it before the app can go live.

one approach can be to try getting the lib working inside the app worker scope, instead of using the main thread addon.

## Timeline

- 2024-03-02T16:45:10Z @tobiu added the `bug` label
### @tobiu - 2024-03-05T16:07:15Z

ok. i did find a replacement which does run inside the `appworker`.

- 2024-03-05T16:07:22Z @tobiu assigned to @tobiu
- 2024-03-05T16:07:55Z @tobiu referenced in commit `19d0cdc` - "Portal.view.learn.ContentTreeList: showdown (markdown) errors #5289"
- 2024-03-05T16:07:58Z @tobiu closed this issue
- 2024-03-26T16:29:39Z @tobiu referenced in commit `b81bb27` - "Portal.view.learn.ContentTreeList: showdown (markdown) errors #5289"

