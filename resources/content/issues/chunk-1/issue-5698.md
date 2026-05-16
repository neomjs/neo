---
id: 5698
title: 'tooltip.Base: singleton mode => honor nested themes'
state: OPEN
labels:
  - enhancement
  - no auto close
assignees: []
createdAt: '2024-08-06T06:37:13Z'
updatedAt: '2024-10-07T21:54:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5698'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# tooltip.Base: singleton mode => honor nested themes

@ExtAnimal 

right now, the tooltip is a direct child of the viewport => using the top-level theme.

since we can nest themes, the tooltip needs to check if the target has an own theme and if not walk up the vdom or dom tree to check for `neo-theme-x` css selectors. use the closest match.

## Timeline

- 2024-08-06T06:37:13Z @tobiu added the `enhancement` label
- 2024-10-07T21:54:46Z @tobiu added the `no auto close` label

