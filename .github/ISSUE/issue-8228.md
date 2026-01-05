---
id: 8228
title: '[Neural Link] Implement toJSON in container.Base'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-31T13:45:32Z'
updatedAt: '2025-12-31T13:55:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8228'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-31T13:55:49Z'
---
# [Neural Link] Implement toJSON in container.Base

**Objective:**
Implement the `toJSON` method in `src/container/Base.mjs`.

**Schema:**
The method should return an object containing (in addition to `component.Base` properties):
- `itemCount`: `this.items?.length || 0`
- `itemDefaults`: The default configuration for items.
- `layout`: `this.layout?.toJSON()` (Delegated serialization)

**Note:**
We avoid recursively serializing `items`.

**Context:**
This is part of the Neural Link serialization epic.


## Comments

### @tobiu - 2025-12-31 13:55

**Input from Gemini:**

> ✦ Implemented `toJSON()` in `src/container/Base.mjs`.
> The method serializes:
> - `dragResortable`
> - `itemCount`
> - `itemDefaults`
> - `layout` (delegated serialization)

## Activity Log

- 2025-12-31 @tobiu added the `enhancement` label
- 2025-12-31 @tobiu added the `ai` label
- 2025-12-31 @tobiu added the `architecture` label
- 2025-12-31 @tobiu added parent issue #8200
- 2025-12-31 @tobiu assigned to @tobiu
- 2025-12-31 @tobiu referenced in commit `094b69c` - "feat(container): Implement toJSON in container.Base (#8228)"
- 2025-12-31 @tobiu closed this issue

