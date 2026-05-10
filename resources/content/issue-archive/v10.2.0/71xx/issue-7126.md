---
id: 7126
title: 'examples.grid.bigData.ControlsContainer: not showing initial dropdown values'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-07-29T23:51:28Z'
updatedAt: '2025-07-29T23:59:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7126'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-29T23:59:39Z'
---
# examples.grid.bigData.ControlsContainer: not showing initial dropdown values

* regression issue in v10.
* related to replacing `getCount()` with `count_` inside `collection.Base`
* `collection.Base`s store is filtered down to zero initially.
* firing a `load` event based on the count is no longer sufficient, instead we need to implement `isLoaded`.

<img width="244" height="197" alt="Image" src="https://github.com/user-attachments/assets/a726155b-2a61-4f1f-ad4d-53e803ecdc3e" />

## Timeline

- 2025-07-29T23:51:28Z @tobiu assigned to @tobiu
- 2025-07-29T23:51:30Z @tobiu added the `bug` label
- 2025-07-29T23:59:15Z @tobiu referenced in commit `0818bf9` - "examples.grid.bigData.ControlsContainer: not showing initial dropdown values #7126"
### @tobiu - 2025-07-29T23:59:39Z

<img width="242" height="196" alt="Image" src="https://github.com/user-attachments/assets/26e3449f-e348-48bf-98fd-b57ca3e89bd3" />

- 2025-07-29T23:59:39Z @tobiu closed this issue

