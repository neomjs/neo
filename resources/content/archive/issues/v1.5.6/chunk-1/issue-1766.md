---
id: 1766
title: 'controller.Component: getParentHandlerScope() => getHandlerScope()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-14T09:25:28Z'
updatedAt: '2021-04-14T09:52:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1766'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-14T09:51:59Z'
---
# controller.Component: getParentHandlerScope() => getHandlerScope()

Since each controller now has a parent config, we can speed up the logic on this one.

We no longer need to access `manager.Component` to search for the closest parent controller, but have direct access.

The new method needs to be recursive and should include the current scope (reason for the name change).

## Timeline

- 2021-04-14T09:25:28Z @tobiu added the `enhancement` label
- 2021-04-14T09:25:29Z @tobiu assigned to @tobiu
- 2021-04-14T09:45:07Z @tobiu referenced in commit `e277978` - "controller.Component: getParentHandlerScope() => getHandlerScope() #1766"
### @tobiu - 2021-04-14T09:51:59Z

As a side effect, all listeners now search the parent chain for potential matches (was only the case for domListeners before).

- 2021-04-14T09:51:59Z @tobiu closed this issue

