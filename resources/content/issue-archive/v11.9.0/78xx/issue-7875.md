---
id: 7875
title: Refactor Neo.manager.Window to extend Neo.manager.Base
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-23T11:19:09Z'
updatedAt: '2025-11-23T11:25:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7875'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-23T11:25:10Z'
---
# Refactor Neo.manager.Window to extend Neo.manager.Base

Refactor Neo.manager.Window to extend Neo.manager.Base.

**Current State:**
- Extends `Neo.core.Base`.
- Manages a `windowMap` (Map) manually.
- Stores `Rectangle` instances directly as values.

**Goal:**
- Extend `Neo.manager.Base`.
- Use the inherited Collection capabilities (`items`, `map`, `get`, `add`, `remove`).
- Store window objects `{id, rect, appName}` instead of just `Rectangle`.
- Update `getWindowAt` to query the collection.

**Benefits:**
- Consistency with other Managers (`Instance`, `Component`).
- Built-in observability (mutate events).
- Simplified code (no manual Map management).


## Timeline

- 2025-11-23T11:19:23Z @tobiu assigned to @tobiu
- 2025-11-23T11:19:31Z @tobiu added the `enhancement` label
- 2025-11-23T11:19:31Z @tobiu added the `ai` label
- 2025-11-23T11:24:54Z @tobiu referenced in commit `2467369` - "Refactor Neo.manager.Window to extend Neo.manager.Base #7875"
- 2025-11-23T11:25:10Z @tobiu closed this issue

