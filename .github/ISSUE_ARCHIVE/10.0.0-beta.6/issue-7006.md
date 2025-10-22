---
id: 7006
title: 'core.IdGenerator: switch from singleton to plain object'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-10T19:44:04Z'
updatedAt: '2025-07-10T19:44:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7006'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-10T19:44:34Z'
---
# core.IdGenerator: switch from singleton to plain object

**Reported by:** @tobiu on 2025-07-10

* We can make this one more lightweight.

Implications:

 * Simpler Definition: The new version is much simpler and more lightweight, as it's just a plain object.
 * No Neo.mjs Class Overhead: It avoids the overhead of the Neo.mjs class system (configs, lifecycle hooks, mixins,
   etc.) for a utility that doesn't require them.
 * Direct Access: Properties like `base` and `idCounter` are directly accessible on the `IdGenerator` object without going through the config system.
 * Explicit Namespace: The namespace assignment is now more explicit.

This refactoring makes sense for a utility like `IdGenerator` that doesn't need the full power of the Neo.mjs class
system and is intended to be a simple, globally accessible singleton.

