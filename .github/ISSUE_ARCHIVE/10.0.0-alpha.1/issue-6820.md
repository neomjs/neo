---
id: 6820
title: >-
  main.mixin.DeltaUpdates: createDomTree() => add a check to skip component
  references
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-06-16T16:56:19Z'
updatedAt: '2025-06-16T17:04:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6820'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-16T17:04:26Z'
---
# main.mixin.DeltaUpdates: createDomTree() => add a check to skip component references

**Reported by:** @tobiu on 2025-06-16

* While these references should not get passed in the first place, a tiny check to ensure nothing bad happens feels needed. after all, dev could manually pass vnodes to main.

