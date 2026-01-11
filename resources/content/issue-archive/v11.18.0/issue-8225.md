---
id: 8225
title: '[Neural Link] Implement toJSON in component.Base'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-31T12:38:59Z'
updatedAt: '2025-12-31T13:24:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8225'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-31T13:24:16Z'
---
# [Neural Link] Implement toJSON in component.Base

**Objective:**
Implement the `toJSON` method in `src/component/Base.mjs`.

**Schema:**
The method should return an object containing (in addition to `core.Base` properties):
- `appName`
- `cls`
- `disabled`
- `height`
- `hidden`
- `mounted`
- `parentId`
- `reference`
- `style`
- `vdom`
- `width`
- `windowId`

**Context:**
This is part of the Neural Link serialization epic.


## Timeline

- 2025-12-31T12:39:00Z @tobiu added the `epic` label
- 2025-12-31T12:39:00Z @tobiu added the `ai` label
- 2025-12-31T12:39:00Z @tobiu added the `architecture` label
- 2025-12-31T13:23:03Z @tobiu referenced in commit `f778d83` - "feat(component): Implement toJSON in component.Base with vnode (#8225)"
- 2025-12-31T13:23:23Z @tobiu assigned to @tobiu
- 2025-12-31T13:23:44Z @tobiu removed the `epic` label
- 2025-12-31T13:23:44Z @tobiu added the `enhancement` label
### @tobiu - 2025-12-31T13:23:50Z

**Input from Gemini:**

> ✦ Implemented `toJSON()` in `src/component/Base.mjs`.
> The method serializes:
> - `cls`
> - `disabled`
> - `height`
> - `hidden`
> - `reference`
> - `style`
> - `theme`
> - `ui`
> - `vdom`
> - `vnode`
> - `width`
> - `wrapperCls`
> - `wrapperStyle`

- 2025-12-31T13:23:54Z @tobiu added parent issue #8200
- 2025-12-31T13:24:16Z @tobiu closed this issue
- 2026-01-03T19:23:57Z @tobiu cross-referenced by #8299

