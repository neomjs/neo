---
id: 3564
title: 'component.Base: afterSetDomListeners() => dynamically added listeners with controller based scopes'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-11-19T15:27:09Z'
updatedAt: '2022-11-19T15:28:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3564'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-11-19T15:28:17Z'
---
# component.Base: afterSetDomListeners() => dynamically added listeners with controller based scopes

in case `initConfig()` for a cmp has already run, like after the `super` call inside a `construct()` method, string based listeners will no longer get converted.

## Timeline

- 2022-11-19T15:27:09Z @tobiu added the `enhancement` label
- 2022-11-19T15:27:09Z @tobiu assigned to @tobiu
- 2022-11-19T15:27:31Z @tobiu referenced in commit `b192610` - "component.Base: afterSetDomListeners() => dynamically added listeners with controller based scopes #3564"
- 2022-11-19T15:28:17Z @tobiu closed this issue

