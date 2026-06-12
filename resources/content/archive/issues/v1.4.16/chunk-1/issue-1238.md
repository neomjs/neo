---
id: 1238
title: 'component.Base: getTheme()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-12T09:32:49Z'
updatedAt: '2020-10-12T10:27:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1238'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-12T10:27:18Z'
---
# component.Base: getTheme()

A Component should be aware of the closest theme which is applied.

Since we can apply a neo theme to any div node, we should check the Component class array for "neo-theme-" matches. If there is no entry, walk up the vdom tree and check each node if it has a theme css rule.

## Timeline

- 2020-10-12T09:32:49Z @tobiu added the `enhancement` label
- 2020-10-12T09:32:49Z @tobiu assigned to @tobiu
- 2020-10-12T09:48:00Z @tobiu referenced in commit `8354879` - "component.Base: getTheme() #1238 (in progress)"
- 2020-10-12T10:27:11Z @tobiu referenced in commit `4d4d29b` - "component.Base: getTheme() #1238"
- 2020-10-12T10:27:19Z @tobiu closed this issue
- 2020-10-12T10:29:36Z @tobiu referenced in commit `9185a04` - "#1238 cleanup"

