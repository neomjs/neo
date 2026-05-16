---
id: 853
title: 'container.Base: pass the rendering config to child components'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-07-01T10:47:26Z'
updatedAt: '2020-07-01T10:48:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/853'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-07-01T10:48:15Z'
---
# container.Base: pass the rendering config to child components

We can run into timing issues in case a component is rendering and vdom changes get applied in the mean time. Example: loading a store for a list and the data arrives "too early".

## Timeline

- 2020-07-01T10:47:27Z @tobiu added the `enhancement` label
- 2020-07-01T10:47:27Z @tobiu assigned to @tobiu
- 2020-07-01T10:48:10Z @tobiu referenced in commit `0229ece` - "container.Base: pass the rendering config to child components #853"
- 2020-07-01T10:48:15Z @tobiu closed this issue

