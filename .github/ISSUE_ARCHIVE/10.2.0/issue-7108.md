---
id: 7108
title: 'docs: Update "Describing a View" for v10 functional components'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-24T15:37:04Z'
updatedAt: '2025-10-22T22:58:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7108'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-28T11:02:37Z'
---
# docs: Update "Describing a View" for v10 functional components

**Reported by:** @tobiu on 2025-07-24

The "Getting Started > Describing a View" guide is a new user's first introduction to building a UI in Neo.mjs. It is critically outdated as it only shows the classic, class-based component model.

This ticket is to update the document to lead with the modern, functional approach introduced in v10.

### Tasks
- Add a new, prominent section at the top titled "The Modern Approach: Functional Components".
- This new section should feature a code example of a simple view built with `defineComponent` and `createVdom`.
- Reframe the existing content as "The Classic Approach: Class-Based Components".
- Add a brief explanation of when to choose one approach over the other (e.g., functional for simple views, class-based for extending the component library or complex stateful logic).

