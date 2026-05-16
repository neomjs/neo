---
id: 6686
title: 'controller.Component: remove parseDomListeners()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-05-02T16:07:44Z'
updatedAt: '2025-05-02T16:11:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6686'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-05-02T16:11:26Z'
---
# controller.Component: remove parseDomListeners()

* The last missing item to remove all controller based parsing logic (resolving string based listeners at creation time)
* `bindCallback()` needs to get moved from `core.Observable` to `core.Base` (needed inside `manager.DomEvent` which is not observable.
* `manager.DomEvent: fire()` needs to use `bindCallback()`

## Timeline

- 2025-05-02T16:07:44Z @tobiu added the `enhancement` label
- 2025-05-02T16:07:44Z @tobiu assigned to @tobiu
- 2025-05-02T16:11:12Z @tobiu referenced in commit `7d8c043` - "controller.Component: remove parseDomListeners() #6686"
- 2025-05-02T16:11:26Z @tobiu closed this issue

