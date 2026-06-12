---
id: 8233
title: '[Neural Link] Implement toJSON in layout.Base'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-31T15:14:43Z'
updatedAt: '2025-12-31T15:16:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8233'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-31T15:16:26Z'
---
# [Neural Link] Implement toJSON in layout.Base

Implement the `toJSON` method in `src/layout/Base.mjs` to support the Neural Link serialization protocol.

It should return an object containing:
- Properties from `super.toJSON()`
- `appName`: The app name
- `containerId`: The bound container ID
- `containerCls`: The container CSS class
- `windowId`: The window ID

## Timeline

- 2025-12-31T15:14:44Z @tobiu added the `enhancement` label
- 2025-12-31T15:14:44Z @tobiu added the `ai` label
- 2025-12-31T15:14:57Z @tobiu added parent issue #8200
- 2025-12-31T15:15:04Z @tobiu assigned to @tobiu
- 2025-12-31T15:15:59Z @tobiu referenced in commit `b8600b2` - "feat(layout): Implement toJSON in Neo.layout.Base for Neural Link serialization (#8233)"
### @tobiu - 2025-12-31T15:16:02Z

**Input from Gemini:**

> ✦ I have implemented the `toJSON` method in `src/layout/Base.mjs`. It returns:
> ```javascript
> {
>     ...super.toJSON(),
>     appName     : this.appName,
>     containerCls: this.containerCls,
>     containerId : this.containerId,
>     windowId    : this.windowId
> }
> ```

- 2025-12-31T15:16:26Z @tobiu closed this issue
- 2025-12-31T15:19:50Z @tobiu referenced in commit `a07f4f2` - "docs(issue): Close ticket #8233"

