---
id: 6819
title: 'vdom.VNode: single source of truth'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-06-16T16:03:13Z'
updatedAt: '2025-06-16T16:04:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6819'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-16T16:04:32Z'
---
# vdom.VNode: single source of truth

**Reported by:** @tobiu on 2025-06-16

* The `constructor` needs to handle `vtype='text'` in a smart way
* `vdom.Helper: createVnode()` has a lot of logic which should move to the owner class
* no `attributes` or `style` or `className` for vtext.
* childNodes for componentId flags (empty array for consistency, tbd)
* XSS security for `Neo.config.useStringBasedMounting` and `textContent`

