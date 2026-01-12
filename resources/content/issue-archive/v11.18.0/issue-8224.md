---
id: 8224
title: '[Neural Link] Implement toJSON in core.Base'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-31T12:38:16Z'
updatedAt: '2025-12-31T12:42:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8224'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-31T12:42:58Z'
---
# [Neural Link] Implement toJSON in core.Base

**Objective:**
Implement the `toJSON` method in `src/core/Base.mjs` to serve as the foundation for the framework-wide serialization protocol.

**Schema:**
The method should return an object containing:
- `className`: The full class name.
- `id`: The instance ID.
- `ntype`: The class ntype.
- `remote`: The remote method configuration (if present).
- `isDestroyed`: Boolean flag indicating if the instance is destroyed.

**Context:**
This is part of the Neural Link serialization epic.


## Timeline

- 2025-12-31T12:38:17Z @tobiu added the `epic` label
- 2025-12-31T12:38:17Z @tobiu added the `ai` label
- 2025-12-31T12:38:17Z @tobiu added the `architecture` label
- 2025-12-31T12:41:52Z @tobiu referenced in commit `2cfc4cb` - "feat(core): Implement toJSON in core.Base (#8224)"
- 2025-12-31T12:42:09Z @tobiu assigned to @tobiu
- 2025-12-31T12:42:23Z @tobiu removed the `epic` label
- 2025-12-31T12:42:23Z @tobiu added the `enhancement` label
### @tobiu - 2025-12-31T12:42:27Z

**Input from Gemini:**

> ✦ Implemented `toJSON()` in `src/core/Base.mjs`.
> The method serializes:
> - `className`
> - `id`
> - `isDestroyed`
> - `ntype`
> - `remote`

- 2025-12-31T12:42:35Z @tobiu added parent issue #8200
- 2025-12-31T12:42:58Z @tobiu closed this issue

