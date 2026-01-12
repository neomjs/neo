---
id: 6817
title: 'vdom.Helper: createVnode() => use vdom.cn as the single source of truth'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-16T12:51:31Z'
updatedAt: '2025-06-16T12:56:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6817'
author: tobiu
commentsCount: 0
parentIssue: 6785
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-16T12:56:03Z'
---
# vdom.Helper: createVnode() => use vdom.cn as the single source of truth

* drop support for `vdom.children`
* drop support for `vdom.childNodes`

both were not actually in use, it is time to remove this confusion.

## Timeline

- 2025-06-16T12:51:31Z @tobiu assigned to @tobiu
- 2025-06-16T12:51:32Z @tobiu added the `enhancement` label
- 2025-06-16T12:51:32Z @tobiu added parent issue #6785
- 2025-06-16T12:55:53Z @tobiu referenced in commit `8a98805` - "vdom.Helper: createVnode() => use vdom.cn as the single source of truth #6817"
- 2025-06-16T12:56:03Z @tobiu closed this issue

