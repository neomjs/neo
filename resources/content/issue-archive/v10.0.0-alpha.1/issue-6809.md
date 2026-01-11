---
id: 6809
title: vdom.util.StringFromVnode
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-15T22:20:16Z'
updatedAt: '2025-06-15T22:21:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6809'
author: tobiu
commentsCount: 0
parentIssue: 6785
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-15T22:21:41Z'
---
# vdom.util.StringFromVnode

* The string based generation logic is now only needed in case `useStringBasedMounting === true`
* So, let us put it into a lazy loaded file, which only gets dynamically imported when the config value matches
* To enable run-time switching, we need to add the import check into both `vdom.Helper` remote methods (create & update)

## Timeline

- 2025-06-15T22:20:17Z @tobiu added the `enhancement` label
- 2025-06-15T22:20:17Z @tobiu added parent issue #6785
- 2025-06-15T22:21:24Z @tobiu referenced in commit `6f15db1` - "vdom.util.StringFromVnode #6809"
- 2025-06-15T22:21:37Z @tobiu assigned to @tobiu
- 2025-06-15T22:21:41Z @tobiu closed this issue

