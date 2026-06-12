---
id: 5984
title: 'util.Logger: add support for logging components inside dialogs'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-09-30T10:49:06Z'
updatedAt: '2024-09-30T10:50:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5984'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-30T10:50:52Z'
---
# util.Logger: add support for logging components inside dialogs

* dialog instances live outside of the viewport
* the concept to add a `contextmenu` listener to the app mainView is not sufficient to honor dialogs
* `manager.DomEvent.fire()` need to pass all `contextmenu` events to the Logger, in case it exists

## Timeline

- 2024-09-30T10:49:06Z @tobiu added the `enhancement` label
- 2024-09-30T10:49:07Z @tobiu assigned to @tobiu
- 2024-09-30T10:50:25Z @tobiu referenced in commit `f1f3f1f` - "util.Logger: add support for logging components inside dialogs #5984"
### @tobiu - 2024-09-30T10:50:52Z

![Screenshot 2024-09-30 at 12 49 42](https://github.com/user-attachments/assets/d37392a1-e157-4ae3-99c6-5ea7f9ef028e)


- 2024-09-30T10:50:52Z @tobiu closed this issue

