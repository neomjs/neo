---
id: 8059
title: '[DomEvent] Add Unit Tests for fire() and Cleanup'
state: CLOSED
labels:
  - ai
  - refactoring
  - testing
assignees:
  - tobiu
createdAt: '2025-12-08T09:13:25Z'
updatedAt: '2025-12-08T09:14:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8059'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-08T09:14:10Z'
---
# [DomEvent] Add Unit Tests for fire() and Cleanup

Create a new test file `test/playwright/unit/manager/domEvent/Fire.spec.mjs` to provide comprehensive unit tests for `Neo.manager.DomEvent.fire()`.

**Coverage:**
*   Standard event firing on a listener component.
*   Event bubbling (Child -> Parent).
*   Stopping propagation (`cancelBubble`).
*   Listener configuration `bubble: false`.
*   Event delegation support.

**Cleanup:**
*   Remove the unused `findComponentReference` method from `src/manager/DomEvent.mjs`.


## Timeline

- 2025-12-08T09:13:26Z @tobiu added the `ai` label
- 2025-12-08T09:13:27Z @tobiu added the `refactoring` label
- 2025-12-08T09:13:27Z @tobiu added the `testing` label
- 2025-12-08T09:13:40Z @tobiu assigned to @tobiu
- 2025-12-08T09:14:07Z @tobiu referenced in commit `f8bbe27` - "[DomEvent] Add Unit Tests for fire() and Cleanup #8059"
- 2025-12-08T09:14:10Z @tobiu closed this issue

