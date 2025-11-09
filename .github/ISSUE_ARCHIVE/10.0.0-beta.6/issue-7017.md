---
id: 7017
title: mixin.component.VdomLifecycle => mixin.VdomLifecycle
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-11T11:19:44Z'
updatedAt: '2025-07-11T11:20:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7017'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-11T11:20:24Z'
---
# mixin.component.VdomLifecycle => mixin.VdomLifecycle

**Reported by:** @tobiu on 2025-07-11

---

**Parent Issue:** #6992 - Functional Components

---

* Since we created `src.functional` as the new root for functional components, we need to move the mixin one level upwards, as the lowest common level.

