---
id: 7062
title: 'functional.component.Base: enhance the `destroy()` signature'
state: OPEN
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - tobiu
createdAt: '2025-07-15T17:42:05Z'
updatedAt: '2025-10-14T07:37:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7062'
author: tobiu
commentsCount: 1
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# functional.component.Base: enhance the `destroy()` signature

**Reported by:** @tobiu on 2025-07-15

---

**Parent Issue:** #6992 - Functional Components

---

* `compnent.Base` uses params to prevent children from triggering update() call when getting destroyed.
* Consistency.
* More importantly preventing not needed calls to the vdom worker.

## Comments

### @github-actions - 2025-10-14 02:41

This issue is stale because it has been open for 90 days with no activity.

