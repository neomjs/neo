---
id: 2308
title: 'component.Base: unmount() => set mounted: false prior to the worker call'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-07T06:26:08Z'
updatedAt: '2021-06-07T06:26:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2308'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-07T06:26:28Z'
---
# component.Base: unmount() => set mounted: false prior to the worker call

this way, child components can prevent vdom updates while the un-mounting is in progress.

## Timeline

- 2021-06-07T06:26:08Z @tobiu added the `enhancement` label
- 2021-06-07T06:26:08Z @tobiu assigned to @tobiu
- 2021-06-07T06:26:25Z @tobiu referenced in commit `ba500f8` - "component.Base: unmount() => set mounted: false prior to the worker call #2308"
- 2021-06-07T06:26:28Z @tobiu closed this issue

