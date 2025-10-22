---
id: 7110
title: 'docs: Update "Instance Lifecycle" guide for v10 async phase'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-24T15:39:06Z'
updatedAt: '2025-07-28T10:52:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7110'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-28T10:52:11Z'
---
# docs: Update "Instance Lifecycle" guide for v10 async phase

**Reported by:** @tobiu on 2025-07-24

The "Instance Lifecycle" guide is missing a critical piece of the v10 architecture: the asynchronous initialization phase. It currently only covers the synchronous creation and destruction.

This ticket is to update the document to include the `initAsync` lifecycle hook.

### Tasks
- Add a new major section titled "The Asynchronous Initialization Flow" between the synchronous creation and destruction sections.
- This section must detail the `async initAsync()` method and its purpose for handling asynchronous operations like data fetching and lazy-loading modules.
- It must explain the role of the `isReady_` config and how the `afterSetIsReady()` hook is used to reliably signal when a component is fully initialized and ready for interaction.

