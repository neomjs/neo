---
id: 8226
title: '[Neural Link] Implement toJSON in component.Abstract'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-31T12:46:02Z'
updatedAt: '2025-12-31T12:57:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8226'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-31T12:57:31Z'
---
# [Neural Link] Implement toJSON in component.Abstract

**Objective:**
Implement the `toJSON` method in `src/component/Abstract.mjs`.

**Schema:**
The method should return an object containing (in addition to `core.Base` properties):
- `appName`
- `bind`
- `data`
- `mounted`
- `parentId`
- `stateProviderId` (if a provider exists)
- `windowId`

**Context:**
This is part of the Neural Link serialization epic.


## Timeline

- 2025-12-31T12:46:04Z @tobiu added the `enhancement` label
- 2025-12-31T12:46:04Z @tobiu added the `ai` label
- 2025-12-31T12:46:04Z @tobiu added the `architecture` label
- 2025-12-31T12:46:10Z @tobiu added parent issue #8200
- 2025-12-31T12:54:56Z @tobiu assigned to @tobiu
- 2025-12-31T12:56:26Z @tobiu referenced in commit `ebb3863` - "feat(component): Implement toJSON in component.Abstract (#8226)"
### @tobiu - 2025-12-31T12:57:07Z

**Input from Gemini:**

> ✦ Implemented `toJSON()` in `src/component/Abstract.mjs`.
> The method serializes:
> - `appName`
> - `bind` (as an array of bound keys)
> - `mounted`
> - `parentId`
> - `stateProvider` (delegated serialization)
> - `windowId`

- 2025-12-31T12:57:31Z @tobiu closed this issue

