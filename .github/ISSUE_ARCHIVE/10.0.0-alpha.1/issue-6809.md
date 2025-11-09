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
closedAt: '2025-06-15T22:21:41Z'
---
# vdom.util.StringFromVnode

**Reported by:** @tobiu on 2025-06-15

---

**Parent Issue:** #6785 - Vnode Tree to DOM Element Mapping

---

* The string based generation logic is now only needed in case `useStringBasedMounting === true`
* So, let us put it into a lazy loaded file, which only gets dynamically imported when the config value matches
* To enable run-time switching, we need to add the import check into both `vdom.Helper` remote methods (create & update)

