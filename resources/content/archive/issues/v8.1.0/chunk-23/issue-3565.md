---
id: 3565
title: 'controller.Component: parseDomListeners()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-11-19T15:29:50Z'
updatedAt: '2022-11-19T19:59:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3565'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-11-19T19:59:04Z'
---
# controller.Component: parseDomListeners()

separate the related logic inside `parseConfig()` into a new method. this allows us to calling it whenever component based `domListeners` change at run time.

## Timeline

- 2022-11-19T15:29:50Z @tobiu added the `enhancement` label
- 2022-11-19T15:29:50Z @tobiu assigned to @tobiu
- 2022-11-19T19:55:21Z @tobiu referenced in commit `7b0f9de` - "controller.Component: parseDomListeners() #3565"
- 2022-11-19T19:59:05Z @tobiu closed this issue

