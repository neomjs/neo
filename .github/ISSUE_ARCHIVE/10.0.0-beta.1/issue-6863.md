---
id: 6863
title: >-
  core.Base: isReady, readyPromise class fields, and support for an optional
  initAsync() method
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-06-24T18:18:15Z'
updatedAt: '2025-06-24T18:58:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6863'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-06-24T18:58:35Z'
---
# core.Base: isReady, readyPromise class fields, and support for an optional initAsync() method

**Reported by:** @tobiu on 2025-06-24

* Many classes do require optional or conditional dynamic imports.
* We need a logical foundation for not overriding `construct()` manually each time.

## Comments

### @tobiu - 2025-06-24 18:57

reopening, because we can do better: using `Promise.resolve().then()` REMOVES the need to put `initRemote()` into the macro task queue.

