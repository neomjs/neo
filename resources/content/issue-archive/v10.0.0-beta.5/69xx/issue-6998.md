---
id: 6998
title: 'component.Base: re-add `initConfig()`'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-07-09T12:18:51Z'
updatedAt: '2025-07-09T12:19:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6998'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-09T12:19:31Z'
---
# component.Base: re-add `initConfig()`

* This is a regression issue for when I was working on the `state.Provider` rewrite.
* It does not affect any released version.
* We do need to register bindings here.
* Rationale: A component can get manually instantiated via `Neo.create()` with a `parentId`, but outside container items. In this case, it needs to immediately resolve stores and bindings.

## Timeline

- 2025-07-09T12:18:51Z @tobiu assigned to @tobiu
- 2025-07-09T12:18:53Z @tobiu added the `bug` label
- 2025-07-09T12:19:17Z @tobiu referenced in commit `b93a9b0` - "component.Base: re-add initConfig() #6998"
- 2025-07-09T12:19:31Z @tobiu closed this issue

