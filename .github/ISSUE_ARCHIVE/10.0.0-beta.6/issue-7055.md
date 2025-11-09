---
id: 7055
title: >-
  examples.ConfigurationViewport: make createConfigurationComponents()
  optionally async
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-15T08:29:12Z'
updatedAt: '2025-07-15T09:29:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7055'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-15T09:29:39Z'
---
# examples.ConfigurationViewport: make createConfigurationComponents() optionally async

**Reported by:** @tobiu on 2025-07-15

---

**Parent Issue:** #6992 - Functional Components

---

- Required for functional components hosting "classic" components, in case you want to subscribe controls to components which get created inside the `createVdom()` effect.
- Rationale: we need to wait "one tick" inside the micro task queue, before the instances exist

