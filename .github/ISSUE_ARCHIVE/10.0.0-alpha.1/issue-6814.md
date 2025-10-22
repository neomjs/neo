---
id: 6814
title: 'component.Base: vdom => remove support for vdom.nodeName'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-16T12:23:45Z'
updatedAt: '2025-06-16T12:29:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6814'
author: tobiu
commentsCount: 0
parentIssue: 6785
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-16T12:29:58Z'
---
# component.Base: vdom => remove support for vdom.nodeName

**Reported by:** @tobiu on 2025-06-16

---

**Parent Issue:** #6785 - Vnode Tree to DOM Element Mapping

---

* It was never used inside the framework code
* We need a single source of truth to prevent lots of additional checks.

