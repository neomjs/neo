---
id: 8140
title: Implement VDom.getById() and optimize component.Base#onScrollCapture()
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
  - core
assignees:
  - tobiu
createdAt: '2025-12-19T09:11:52Z'
updatedAt: '2025-12-19T09:17:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8140'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-19T09:17:48Z'
---
# Implement VDom.getById() and optimize component.Base#onScrollCapture()

### Description
To improve performance and maintain consistency with `Neo.util.VNode`, we need to implement a dedicated `getById()` method in `Neo.util.VDom`. The current approach of using `VDom.find(vdom, id)` in `component.Base#onScrollCapture()` is slightly more expensive for the hot-path.

### Tasks
- [x] Implement `static getById(vdom, id)` in `src/util/VDom.mjs`.
- [x] Update `onScrollCapture(data)` in `src/component/Base.mjs` to use `VDomUtil.getById()`.

### Rationale
`VNodeUtil.getById()` is already implemented. Adding `VDomUtil.getById()` ensures consistency and provides a faster lookup for ID-based searches in the VDOM tree, especially useful in hot-paths like scroll capturing.

## Activity Log

- 2025-12-19 @tobiu added the `enhancement` label
- 2025-12-19 @tobiu added the `ai` label
- 2025-12-19 @tobiu added the `performance` label
- 2025-12-19 @tobiu added the `core` label
- 2025-12-19 @tobiu assigned to @tobiu
- 2025-12-19 @tobiu referenced in commit `7a797ea` - "Implement VDom.getById() and optimize component.Base#onScrollCapture() #8140"
- 2025-12-19 @tobiu closed this issue

