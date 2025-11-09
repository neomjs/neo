---
id: 6807
title: 'main.mixin.DeltaUpdates: du_insertNode() => use the new hasLeadingTextChildren'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-15T19:59:29Z'
updatedAt: '2025-06-15T20:00:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6807'
author: tobiu
commentsCount: 0
parentIssue: 6785
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-15T20:00:46Z'
---
# main.mixin.DeltaUpdates: du_insertNode() => use the new hasLeadingTextChildren

**Reported by:** @tobiu on 2025-06-15

---

**Parent Issue:** #6785 - Vnode Tree to DOM Element Mapping

---

* Since the vdom worker now takes care of it, we no longer need the hack to check for leading comments inside Main.

