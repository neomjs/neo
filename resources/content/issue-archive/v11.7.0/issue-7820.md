---
id: 7820
title: Refactor Neo.apps to support multi-window instances
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-20T10:45:19Z'
updatedAt: '2025-11-20T11:38:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7820'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-20T11:38:36Z'
---
# Refactor Neo.apps to support multi-window instances

**Problem**
Currently, `Neo.apps` is a map keyed by `appName` (e.g. `Neo.apps['Portal']`). 
If multiple instances of the same app (same name) run in different windows but share the same App worker (SharedWorker context), the new instance overwrites the previous one in the `Neo.apps` registry.
This makes it impossible to correctly manage state or references for the overwritten app instances.

**Proposed Solution**
1. Refactor `Neo.apps` to be keyed by `windowId` (which is unique per window context).
   - `Neo.apps[myWindowId]` -> App Instance
2. Introduce `Neo.appsByName` to store arrays of app instances sharing the same name.
   - `Neo.appsByName['Portal']` -> `[AppInstance1, AppInstance2]`
3. Update `Neo.controller.Application` to register itself into both structures.
4. Update `Neo.component.Abstract#getApp` to resolve the correct app instance using `this.windowId`.
5. Update internal framework usages of `Neo.apps` to align with the new structure.

**Breaking Change**
This is a breaking change for any code directly accessing `Neo.apps['AppName']`. 
Developers should switch to using `Neo.apps[windowId]` or the new helper methods.


## Timeline

- 2025-11-20T10:45:52Z @tobiu assigned to @tobiu
- 2025-11-20T10:45:59Z @tobiu added the `enhancement` label
- 2025-11-20T10:45:59Z @tobiu added the `ai` label
- 2025-11-20T11:23:39Z @tobiu referenced in commit `a6d5582` - "Refactor Neo.apps to support multi-window instances #7820"
- 2025-11-20T11:38:31Z @tobiu referenced in commit `136e6f7` - "#7820 additional items"
- 2025-11-20T11:38:36Z @tobiu closed this issue

