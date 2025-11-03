---
id: 7062
title: 'functional.component.Base: enhance the `destroy()` signature'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - ad1tyayadav
createdAt: '2025-07-15T17:42:05Z'
updatedAt: '2025-10-27T10:45:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7062'
author: tobiu
commentsCount: 3
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-27T10:45:02Z'
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

### @ad1tyayadav - 2025-10-26 13:23

assign me


### @tobiu - 2025-10-26 13:27

Thanks for your interest. For this one I recommend to look into:
https://github.com/neomjs/neo/blob/dev/src/component/Base.mjs#L1144
https://github.com/neomjs/neo/blob/dev/src/container/Base.mjs#L476

I would also recommend the "AI Native" workflows and let agents figure out the details, e.g. what could get moved into:
https://github.com/neomjs/neo/blob/dev/src/component/Abstract.mjs#L284

