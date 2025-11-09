---
id: 6802
title: >-
  main.mixin.DeltaUpdates: createDomTree() => move the id generation outside of
  attributes
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-15T15:26:24Z'
updatedAt: '2025-06-15T15:27:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6802'
author: tobiu
commentsCount: 0
parentIssue: 6785
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-15T15:27:11Z'
---
# main.mixin.DeltaUpdates: createDomTree() => move the id generation outside of attributes

**Reported by:** @tobiu on 2025-06-15

---

**Parent Issue:** #6785 - Vnode Tree to DOM Element Mapping

---

* vnode.attributes does not contain the id, it is a top-level property for convenience reasons

