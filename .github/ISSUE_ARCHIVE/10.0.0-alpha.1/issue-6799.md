---
id: 6799
title: 'vdom.Helper: create() => refactoring needed'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-15T13:44:04Z'
updatedAt: '2025-06-15T13:44:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6799'
author: tobiu
commentsCount: 0
parentIssue: 6785
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-15T13:44:56Z'
---
# vdom.Helper: create() => refactoring needed

**Reported by:** @tobiu on 2025-06-15

---

**Parent Issue:** #6785 - Vnode Tree to DOM Element Mapping

---

* The method is consuming an overloaded vdom object
* The method is returning an overloaded vnode object
* Time to get rid of this technical debt, and separate both accordingly

