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
closedAt: '2025-06-16T12:56:03Z'
---
# vdom.Helper: createVnode() => use vdom.cn as the single source of truth

**Reported by:** @tobiu on 2025-06-16

---

**Parent Issue:** #6785 - Vnode Tree to DOM Element Mapping

---

* drop support for `vdom.children`
* drop support for `vdom.childNodes`

both were not actually in use, it is time to remove this confusion.

