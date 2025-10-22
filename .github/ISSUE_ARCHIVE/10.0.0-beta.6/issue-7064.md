---
id: 7064
title: 'mixin.VdomLifecycle: missing NeoArray import'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-07-15T17:52:01Z'
updatedAt: '2025-07-15T17:52:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7064'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-15T17:52:29Z'
---
# mixin.VdomLifecycle: missing NeoArray import

**Reported by:** @tobiu on 2025-07-15

* While mixins are only supposed to provide content to get copied over, they must also import all related dependencies for the lexical scope.

