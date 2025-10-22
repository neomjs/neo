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
closedAt: '2025-07-29T23:59:39Z'
---
# examples.grid.bigData.ControlsContainer: not showing initial dropdown values

**Reported by:** @tobiu on 2025-07-29

* regression issue in v10.
* related to replacing `getCount()` with `count_` inside `collection.Base`
* `collection.Base`s store is filtered down to zero initially.
* firing a `load` event based on the count is no longer sufficient, instead we need to implement `isLoaded`.

<img width="244" height="197" alt="Image" src="https://github.com/user-attachments/assets/a726155b-2a61-4f1f-ad4d-53e803ecdc3e" />

## Comments

### @tobiu - 2025-07-29 23:59

<img width="242" height="196" alt="Image" src="https://github.com/user-attachments/assets/26e3449f-e348-48bf-98fd-b57ca3e89bd3" />

