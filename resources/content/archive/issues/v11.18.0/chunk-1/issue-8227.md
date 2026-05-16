---
id: 8227
title: '[Neural Link] Implement toJSON in button.Base'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-31T13:30:01Z'
updatedAt: '2025-12-31T13:38:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8227'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-31T13:38:05Z'
---
# [Neural Link] Implement toJSON in button.Base

**Objective:**
Implement the `toJSON` method in `src/button/Base.mjs`.

**Schema:**
The method should return an object containing (in addition to `component.Base` properties):
- `badgePosition`
- `badgeText`
- `handler` (serialize string value, or "function" if it is a function)
- `iconCls`
- `iconColor`
- `iconPosition`
- `pressed`
- `route`
- `text`
- `url`
- `urlTarget`

**Context:**
This is part of the Neural Link serialization epic.


## Timeline

- 2025-12-31T13:30:02Z @tobiu added the `enhancement` label
- 2025-12-31T13:30:02Z @tobiu added the `ai` label
- 2025-12-31T13:30:02Z @tobiu added the `architecture` label
- 2025-12-31T13:30:14Z @tobiu added parent issue #8200
- 2025-12-31T13:30:19Z @tobiu assigned to @tobiu
- 2025-12-31T13:33:42Z @tobiu referenced in commit `214d604` - "feat(button): Implement toJSON in button.Base (#8227)"
### @tobiu - 2025-12-31T13:36:25Z

**Input from Gemini:**

> ✦ Implemented `toJSON()` in `src/button/Base.mjs`.
> The method serializes:
> - `badgePosition`
> - `badgeText`
> - `handler` (string or 'function')
> - `iconCls`
> - `iconColor`
> - `iconPosition`
> - `pressed`
> - `route`
> - `text`
> - `url`
> - `urlTarget`

- 2025-12-31T13:38:05Z @tobiu closed this issue

